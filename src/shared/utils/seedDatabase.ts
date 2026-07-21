// src/shared/utils/seedDatabase.ts
import { supabase } from "@/shared/api/supabaseClient";
import { SITE_BLUEPRINTS } from "@/config/sites";
import { EXCEL_MAPPINGS } from "@/config/mappings/excelMappings";

async function seedSiteData(siteCode: string, defaultSiteName: string): Promise<{ success: boolean; message: string }> {
  try {
    const blueprint = SITE_BLUEPRINTS[siteCode];
    if (!blueprint) {
      throw new Error(`Blueprint for site code ${siteCode} not found.`);
    }

    // 1. Fetch the site_id from public.sites table
    let siteId: string;
    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('site_code', siteCode)
      .maybeSingle();

    if (siteError) throw siteError;

    if (siteData) {
      siteId = siteData.id;
    } else {
      // Create site if it doesn't exist
      const { data: newSite, error: createError } = await supabase
        .from('sites')
        .insert({
          site_code: siteCode,
          site_name: defaultSiteName
        })
        .select()
        .single();
      
      if (createError) throw createError;
      siteId = newSite.id;
    }

    console.log(`[DCIMe Seed] Found or created ${siteCode} Site UUID: ${siteId}`);

    // Get all equipment IDs from the blueprint
    const blueprintEquipIds = blueprint.equipment.map((e: any) => e.id);

    // 2. Perform idempotent cleanup of existing equipment & rooms for this site
    const { data: existingEquip } = await supabase
      .from('equipment_registry')
      .select('equipment_id')
      .eq('site_uuid', siteId);

    const siteEquipIds = (existingEquip || []).map((e) => e.equipment_id);
    const allEquipIdsToDelete = Array.from(new Set([...siteEquipIds, ...blueprintEquipIds]));

    if (allEquipIdsToDelete.length > 0) {
      console.log(`[DCIMe Seed] Cleaning up existing ${siteCode} parameters...`);
      // Delete parameters referencing site equipment
      const { error: deleteParamsErr } = await supabase
        .from('equipment_parameters')
        .delete()
        .in('equipment_id', allEquipIdsToDelete);
      if (deleteParamsErr) throw deleteParamsErr;

      // Delete equipment registry entries
      const { error: deleteEquipErr } = await supabase
        .from('equipment_registry')
        .delete()
        .in('equipment_id', allEquipIdsToDelete);
      if (deleteEquipErr) throw deleteEquipErr;
    }

    // Delete rooms under this site
    console.log(`[DCIMe Seed] Cleaning up ${siteCode} rooms...`);
    const { error: deleteRoomsErr } = await supabase
      .from('rooms')
      .delete()
      .eq('site_id', siteId);
    if (deleteRoomsErr) throw deleteRoomsErr;

    // 3. Loop through Rooms in blueprint
    console.log(`[DCIMe Seed] Inserting rooms for ${siteCode}...`);
    const roomUuidMap = new Map<string, string>();

    for (const room of blueprint.rooms) {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          site_id: siteId,
          room_name: room.name,
          sort_order: room.sort_order
        })
        .select()
        .single();

      if (roomError) throw roomError;
      roomUuidMap.set(room.id, roomData.id);
    }

    // 4. Loop through Equipment in blueprint
    console.log(`[DCIMe Seed] Inserting equipment & parameters for ${siteCode}...`);
    for (const equip of blueprint.equipment) {
      const dbRoomId = roomUuidMap.get(equip.room_id) || null;
      const roomName = blueprint.rooms.find((r: any) => r.id === equip.room_id)?.name || 'Unknown Room';

      const { error: equipError } = await supabase
        .from('equipment_registry')
        .insert({
          equipment_id: equip.id,
          category: equip.category,
          location: roomName,
          is_active: true,
          room_id: dbRoomId,
          sort_order: equip.sort_order,
          site_uuid: siteId
        });

      if (equipError) throw equipError;

      // Prepare parameters payload
      const paramsPayload = equip.metrics.map((metric: any) => {
        // Resolve Excel mapping coordinates from the broker registry
        const mappings = EXCEL_MAPPINGS[siteCode]?.[metric.id] || [];
        const dest = mappings[0] || null;

        const excel_workbook = dest ? dest.workbook : null;
        const excel_sheet_name = dest ? dest.sheetName : null;
        const excel_column_index = dest ? dest.excelColumnIndex : null;

        // Clean label to extract unit, e.g. "Temperature (°C)"
        const match = metric.label.match(/\(([^)]+)\)/);
        const unit = match ? match[1] : null;

        return {
          equipment_id: equip.id,
          parameter_name: metric.label,
          data_type: metric.type === 'text' ? 'string' : metric.type,
          is_constant: metric.is_constant || false,
          constant_value: metric.default_value !== undefined ? String(metric.default_value) : null,
          is_graphable: metric.type === 'number',
          unit: unit,
          excel_workbook,
          excel_sheet_name,
          excel_column_index
        };
      });

      if (paramsPayload.length > 0) {
        const { error: paramsError } = await supabase
          .from('equipment_parameters')
          .insert(paramsPayload);

        if (paramsError) throw paramsError;
      }
    }

    console.log(`[DCIMe Seed] ${siteCode} Data seeded successfully!`);
    return { success: true, message: `${siteCode} Database seeded successfully from JSON blueprint.` };
  } catch (err: any) {
    console.error(`[DCIMe Seed] ${siteCode} Seeding error:`, err);
    return { success: false, message: err.message || 'Seeding failed.' };
  }
}

export async function seedWtcData(): Promise<{ success: boolean; message: string }> {
  return seedSiteData('WTC', 'WTC Zambia');
}

export async function seedNtcData(): Promise<{ success: boolean; message: string }> {
  return seedSiteData('NTC', 'NTC Zambia');
}
