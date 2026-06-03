import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProductionPlanMaterials } from './productionPlanMaterials';

test('generates material rows per order item without cross-row merging', () => {
  const materials = buildProductionPlanMaterials([
    {
      id: 101,
      productName: '柴油水泵',
      displayName: '柴油水泵1',
      quantity: 10,
      detailRequirement: '产品型号：3寸小油箱清水泵；动力型号：178F 螺纹轴 手启动；泵体规格：3寸铝壳泵；颜色要求：蓝色油箱导风罩；品牌要求：Asaman品牌油箱转印贴花，中性英文纸箱包装',
    },
    {
      id: 102,
      productName: '柴油水泵',
      displayName: '柴油水泵2',
      quantity: 10,
      detailRequirement: '产品型号：4寸小油箱清水泵；动力型号：186F 螺纹轴 手启动；泵体规格：4寸铝壳泵；颜色要求：蓝色油箱导风罩；品牌要求：Asaman品牌油箱转印贴花，中性英文纸箱包装',
    },
  ]);

  assert.deepEqual(materials.map((material) => ({
    orderItemId: material.orderItemId,
    name: material.name,
    spec: material.spec,
    unit: material.unit,
    required: material.required,
  })), [
    { orderItemId: 101, name: '动力泵体', spec: '178F 螺纹轴 手启动 / 3寸铝壳泵', unit: '套', required: 10 },
    { orderItemId: 101, name: '机柜', spec: '蓝色油箱导风罩', unit: '套', required: 10 },
    { orderItemId: 101, name: '贴花', spec: 'Asaman品牌油箱转印贴花', unit: '套', required: 10 },
    { orderItemId: 101, name: '纸箱', spec: '中性英文纸箱包装', unit: '个', required: 10 },
    { orderItemId: 102, name: '动力泵体', spec: '186F 螺纹轴 手启动 / 4寸铝壳泵', unit: '套', required: 10 },
    { orderItemId: 102, name: '机柜', spec: '蓝色油箱导风罩', unit: '套', required: 10 },
    { orderItemId: 102, name: '贴花', spec: 'Asaman品牌油箱转印贴花', unit: '套', required: 10 },
    { orderItemId: 102, name: '纸箱', spec: '中性英文纸箱包装', unit: '个', required: 10 },
  ]);
});

test('applies simple negative rules and keeps battery cable positive requirement', () => {
  const materials = buildProductionPlanMaterials([
    {
      id: 201,
      productName: '柴油水泵',
      quantity: 50,
      detailRequirement: '动力型号：186FAE 电启动；泵体规格：2寸铸铁泵；颜色要求：红色油箱导风罩；中性英文纸箱包装；不贴油箱贴花；无底阀；不装电瓶（电瓶线要带上）',
    },
  ]);

  assert.deepEqual(materials.map((material) => material.name), ['动力泵体', '机柜', '纸箱', '电瓶线']);
  assert.equal(materials.find((material) => material.name === '动力泵体')?.spec, '186FAE 电启动 / 2寸铸铁泵');
  assert.equal(materials.find((material) => material.name === '纸箱')?.required, 50);
  assert.equal(materials.some((material) => material.name === '贴花'), false);
  assert.equal(materials.some((material) => material.name === '电瓶'), false);
});
