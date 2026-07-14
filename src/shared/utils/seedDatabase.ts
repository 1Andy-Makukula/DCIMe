import { supabase } from "@/shared/api/supabaseClient";
import { MASTER_ASSET_DICTIONARY } from "@/features/field/constants/telemetrySchema";

function mapAssetCategory(assetId: string): string {
  const id = assetId.toLowerCase();
  if (id.startsWith('ups_')) return 'UPS';
  if (id.startsWith('dg_')) return 'GENERATOR';
  if (id.startsWith('grid_')) return 'MAINS';
  if (id.startsWith('rectifier_')) return 'RECTIFIER';
  if (id.startsWith('pac_')) return 'AIRCON';
  if (id.includes('ambient')) return 'ENVIRONMENT';
  if (id.includes('fm200')) return 'FIRE_SUPPRESSION';
  if (id.includes('fuel')) return 'FUEL_LOGISTICS';
  if (id.includes('workstation')) return 'ENVIRONMENT';
  return 'ENVIRONMENT';
}

function extractUnit(label: string): string | null {
  const match = label.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}

async function seedSiteData(siteCode: string, defaultSiteName: string): Promise<{ success: boolean; message: string }> {
  try {
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

    // 2. Perform idempotent cleanup of existing equipment & rooms for this site
    const { data: existingEquip } = await supabase
      .from('equipment_registry')
      .select('equipment_id')
      .eq('site_uuid', siteId);

    const siteEquipIds = (existingEquip || []).map((e) => e.equipment_id);
    const dictEquipIds = MASTER_ASSET_DICTIONARY.flatMap((cat) => cat.assets.map((a) => a.id));
    const allEquipIdsToDelete = Array.from(new Set([...siteEquipIds, ...dictEquipIds]));

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

    // 3. Loop through MASTER_ASSET_DICTIONARY (Rooms)
    console.log(`[DCIMe Seed] Starting seed inserts for ${siteCode}...`);
    for (let rIdx = 0; rIdx < MASTER_ASSET_DICTIONARY.length; rIdx++) {
      const category = MASTER_ASSET_DICTIONARY[rIdx];

      // INSERT Room
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          site_id: siteId,
          room_name: category.categoryName,
          sort_order: rIdx
        })
        .select()
        .single();

      if (roomError) throw roomError;
      const roomId = roomData.id;

      // Loop through assets in this category/room
      for (let aIdx = 0; aIdx < category.assets.length; aIdx++) {
        const asset = category.assets[aIdx];

        // INSERT equipment
        const { error: equipError } = await supabase
          .from('equipment_registry')
          .insert({
            equipment_id: asset.id,
            category: mapAssetCategory(asset.id),
            location: category.categoryName,
            is_active: true,
            room_id: roomId,
            sort_order: aIdx,
            site_uuid: siteId
          });

        if (equipError) throw equipError;

        // Loop through metrics/parameters in this asset
        const paramsPayload = asset.metrics.map((metric) => {
          // Destructure excel mapping details
          let excel_workbook: string | null = null;
          let excel_sheet_name: string | null = null;
          let excel_column_index: number | null = null;

          if (metric.destinations && metric.destinations.length > 0) {
            const dest = metric.destinations[0];
            excel_workbook = dest.workbook;
            excel_sheet_name = dest.sheetName;
            excel_column_index = dest.excelColumnIndex;
          }

          // Map legacy text to string data type
          const dataTypeMap: Record<string, string> = {
            number: 'number',
            boolean: 'boolean',
            text: 'string',
            string: 'string'
          };
          const mappedDataType = dataTypeMap[metric.type] || 'number';

          return {
            equipment_id: asset.id,
            parameter_name: metric.label,
            data_type: mappedDataType,
            is_constant: metric.isConstant || false,
            constant_value: metric.defaultValue !== undefined ? String(metric.defaultValue) : null,
            is_graphable: metric.type === 'number',
            unit: extractUnit(metric.label),
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
    }

    console.log(`[DCIMe Seed] ${siteCode} Data seeded successfully!`);
    return { success: true, message: `${siteCode} Database seeded successfully from legacy dictionary.` };
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
