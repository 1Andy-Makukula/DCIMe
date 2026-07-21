// src/features/field/hooks/useSiteEquipment.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { SITE_BLUEPRINTS } from "@/config/sites";

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
  } | null;
  equipment_parameters?: EquipmentParameter[];
}

export interface GroupedEquipment {
  [roomName: string]: Equipment[];
}

export function useSiteEquipment() {
  const { currentSite } = useCurrentSite();
  const siteCode = currentSite?.site_code || "NTC";
  const blueprint = SITE_BLUEPRINTS[siteCode] || SITE_BLUEPRINTS.NTC;

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
        .eq("site_uuid", currentSite.id);

      if (fetchError) throw fetchError;

      // Index DB equipment status & parameters by equipment_id
      const dbEquipMap = new Map<string, any>();
      (data || []).forEach((item: any) => {
        dbEquipMap.set(item.equipment_id.toLowerCase(), item);
      });

      // Construct groupedEquipment dynamically based on the blueprint rooms & equipment
      const grouped: GroupedEquipment = {};

      blueprint.rooms.forEach((room: any) => {
        const roomName = room.name;
        const roomEquip = blueprint.equipment.filter((e: any) => e.room_id === room.id);
        
        const mappedEquip: Equipment[] = [];
        
        roomEquip.forEach((eqBp: any) => {
          const dbEquip = dbEquipMap.get(eqBp.id.toLowerCase());
          const isActive = dbEquip ? dbEquip.is_active : true;
          
          if (isActive) {
            mappedEquip.push({
              equipment_id: eqBp.id,
              category: eqBp.category,
              location: roomName,
              is_active: true,
              room_id: room.id,
              sort_order: eqBp.sort_order,
              site_uuid: currentSite.id,
              rooms: {
                id: room.id,
                room_name: roomName,
                site_id: currentSite.id,
                sort_order: room.sort_order
              },
              equipment_parameters: dbEquip?.equipment_parameters || []
            });
          }
        });

        if (mappedEquip.length > 0) {
          grouped[roomName] = mappedEquip.sort((a, b) => a.sort_order - b.sort_order);
        }
      });

      setGroupedEquipment(grouped);
    } catch (err: any) {
      console.error("Error fetching equipment for site:", err);
      setError(err.message || "Failed to load site equipment.");
    } finally {
      setIsLoading(false);
    }
  }, [currentSite?.id, siteCode]);

  useEffect(() => {
    fetchEquipment();

    if (!currentSite?.id) return;

    const channel = supabase
      .channel(`equipment_registry_realtime_${currentSite.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "equipment_registry",
          filter: `site_uuid=eq.${currentSite.id}`
        },
        () => {
          fetchEquipment();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEquipment, currentSite?.id]);

  return {
    groupedEquipment,
    isLoading,
    error,
    refresh: fetchEquipment
  };
}
