import { parseProductionRequirement } from './productionRequirementParser';

export type ProductionPlanMaterialInput = {
  id?: number;
  productName: string;
  displayName?: string;
  quantity: number;
  detailRequirement?: string;
};

export type ProductionPlanMaterialCreateData = {
  orderItemId?: number;
  name: string;
  spec: string;
  unit: string;
  required: number;
  status: 'pending';
  source: 'plan_derived';
  notes?: string;
};

function displayNameFor(item: ProductionPlanMaterialInput) {
  return item.displayName || item.productName;
}

function addMaterial(
  materials: ProductionPlanMaterialCreateData[],
  item: ProductionPlanMaterialInput,
  name: string,
  spec: string,
  unit: string,
) {
  const cleanedSpec = spec.trim();
  if (!cleanedSpec) return;
  const existsInSameItem = materials.some((material) => (
    material.orderItemId === item.id
    && material.name === name
    && material.spec === cleanedSpec
    && material.unit === unit
  ));
  if (existsInSameItem) return;

  materials.push({
    orderItemId: item.id,
    name,
    spec: cleanedSpec,
    unit,
    required: item.quantity,
    status: 'pending',
    source: 'plan_derived',
    notes: `来源：${displayNameFor(item)}`,
  });
}

export function buildProductionPlanMaterials(items: ProductionPlanMaterialInput[]) {
  const materials: ProductionPlanMaterialCreateData[] = [];

  for (const item of items) {
    const parsed = parseProductionRequirement(item.detailRequirement || '', item.productName);
    const powerPumpSpec = [parsed.powerModel, parsed.pumpBody].filter(Boolean).join(' / ');
    addMaterial(materials, item, '动力泵体', powerPumpSpec, '套');
    addMaterial(materials, item, '机柜', parsed.cabinet, '套');
    addMaterial(materials, item, '机架电机', parsed.frameMotor, '套');
    addMaterial(materials, item, '面板', parsed.panel, '套');
    addMaterial(materials, item, '贴花', parsed.decal, '套');
    addMaterial(materials, item, '纸箱', parsed.carton, '个');
    addMaterial(materials, item, '电瓶线', parsed.batteryCable, '套');
  }

  return materials;
}
