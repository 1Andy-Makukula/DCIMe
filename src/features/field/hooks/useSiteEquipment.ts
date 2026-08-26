// src/features/field/hooks/useSiteEquipment.ts
import { useState, useEffect, useCallback } from "react";
import { useRealtimeTable } from "@/shared/api/realtime";
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
            capture_mode,
            is_graphable,
            unit,
            created_at
          )
        `)
        .eq("site_uuid", currentSite.id);

      if (fetchError) throw fetchError;

      // Index DB equipment status & parameters by equipment_id.
      //
      // NOT_APPLICABLE parameters are stripped here rather than at each caller.
      // They exist so a workbook column prints 'NA' instead of blank; they are
      // not readings, and nothing that walks this list should draw a field for
      // one. PathRenderer merges these into the round, so leaving them in put
      // 221 uncollectable fields on the technician's screen the moment the
      // registry was loaded.
      const dbEquipMap = new Map<string, any>();
      (data || []).forEach((item: any) => {
        dbEquipMap.set(item.equipment_id.toLowerCase(), {
          ...item,
          equipment_parameters: (item.equipment_parameters || []).filter(
            (p: any) => p.capture_mode !== "NOT_APPLICABLE"
          )
        });
      });

      // Grouped from the registry itself, not from the blueprint JSON.
      //
      // The blueprint used to supply the room list and the asset list while the
      // database supplied only their status. Both now live in the registry —
      // 14 rooms and 47 assets, the same ones — so the file has nothing left to
      // contribute here, and one source cannot drift from another.
      //
      // Rooms are keyed by NAME, as they were before, so every consumer of
      // groupedEquipment keeps working unchanged. Insertion order carries the
      // walking order, which is why rows are sorted by the room's sort_order
      // before grouping rather than after.
      const grouped: GroupedEquipment = {};

      const rows = [...dbEquipMap.values()]
        .filter((item: any) => item.is_active !== false)
        .sort((a: any, b: any) =>
          ((a.rooms?.sort_order ?? 0) - (b.rooms?.sort_order ?? 0)) ||
          ((a.sort_order ?? 0) - (b.sort_order ?? 0)));

      rows.forEach((item: any) => {
        // An asset with no room would otherwise vanish from the round entirely.
        const roomName = item.rooms?.room_name ?? "Unassigned";
        (grouped[roomName] ??= []).push({
          equipment_id: item.equipment_id,
          category: item.category,
          location: roomName,
          is_active: true,
          room_id: item.room_id,
          sort_order: item.sort_order ?? 0,
          site_uuid: currentSite.id,
          rooms: item.rooms
            ? {
                id: item.rooms.id,
                room_name: item.rooms.room_name,
                site_id: item.rooms.site_id,
                sort_order: item.rooms.sort_order
              }
            : null,
          equipment_parameters: item.equipment_parameters || []
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

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  useRealtimeTable({
    table:    "equipment_registry",
    filter:   currentSite?.id ? `site_uuid=eq.${currentSite.id}` : undefined,
    enabled:  !!currentSite?.id,
    onChange: fetchEquipment
  });

  return {
    groupedEquipment,
    isLoading,
    error,
    refresh: fetchEquipment
  };
}
