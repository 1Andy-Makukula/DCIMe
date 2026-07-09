import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

export interface EquipmentParameter {
  id: string;
  equipment_id: string;
  parameter_name: string;
  data_type: 'number' | 'string' | 'boolean' | string;
  is_constant: boolean;
  constant_value: string | null;
  is_graphable: boolean;
  unit: string | null;
  created_at: string;
}

export interface Equipment {
  equipment_id: string;
  category: "UPS" | "GENERATOR" | "MAINS" | "RECTIFIER" | "AIRCON" | "ENVIRONMENT" | "FIRE_SUPPRESSION" | "FUEL_LOGISTICS" | "LOAD_PANEL" | string;
  location: string;
  is_active: boolean;
  room_id: string | null;
  sort_order: number;
  site_uuid: string | null;
  rooms?: {
    id: string;
    room_name: string;
    site_id: string;
    sort_order: number;
  }[] | {
    id: string;
    room_name: string;
    site_id: string;
    sort_order: number;
  } | null;
  equipment_parameters?: EquipmentParameter[];
}

export interface GroupedEquipment {
  [roomName: string]: Equipment[];
}

export function useSiteEquipment() {
  const { currentSite } = useCurrentSite();
  const [groupedEquipment, setGroupedEquipment] = useState<GroupedEquipment>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEquipment = useCallback(async () => {
    if (!currentSite?.id) {
      setGroupedEquipment({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("equipment_registry")
        .select(`
          equipment_id,
          category,
          location,
          is_active,
          room_id,
          sort_order,
          site_uuid,
          rooms:room_id (
            id,
            room_name,
            site_id,
            sort_order
          ),
          equipment_parameters (
            id,
            equipment_id,
            parameter_name,
            data_type,
            is_constant,
            constant_value,
            is_graphable,
            unit,
            created_at
          )
        `)
        .eq("site_uuid", currentSite.id)
        .eq("is_active", true)
        .order("room_id", { ascending: true })
        .order("sort_order", { ascending: true });

      if (fetchError) throw fetchError;

      const grouped: GroupedEquipment = {};
      (data || []).forEach((item: any) => {
        const joinedRooms = item.rooms;
        const roomObj = Array.isArray(joinedRooms) ? joinedRooms[0] : joinedRooms;
        const roomName = roomObj?.room_name || "Unassigned Room";

        if (!grouped[roomName]) {
          grouped[roomName] = [];
        }
        grouped[roomName].push({
          ...item,
          rooms: roomObj || null
        });
      });

      setGroupedEquipment(grouped);
    } catch (err: any) {
      console.error("Error fetching equipment for site:", err);
      setError(err.message || "Failed to load site equipment.");
    } finally {
      setIsLoading(false);
    }
  }, [currentSite?.id]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  return {
    groupedEquipment,
    isLoading,
    error,
    refresh: fetchEquipment
  };
}
