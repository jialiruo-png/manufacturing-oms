import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始初始化种子数据...');

  // Check if already seeded
  const existingProducts = await prisma.product.count();
  if (existingProducts > 0) {
    console.log('✓ 数据库已有数据，跳过初始化');
    return;
  }

  // ---- Products + BOMs ----
  const products = await Promise.all([
    prisma.product.create({
      data: {
        code: 'GEN1K',
        name: '1kW便携式发电机',
        description: '单相汽油发电机，168F动力，适合户外应急',
        unitPrice: 1280,
        bomItems: {
          create: [
            { materialName: '168F发动机', spec: '168F四冲程', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '单相1kW', unit: '个', qty: 1 },
            { materialName: '机架', spec: '钢管焊接', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '3.6L', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '标准型', unit: '个', qty: 1 },
            { materialName: '空气滤清器', spec: '泡沫型', unit: '个', qty: 1 },
            { materialName: '火花塞', spec: 'F7RTC', unit: '个', qty: 1 },
            { materialName: '控制面板', spec: '单相2插座', unit: '套', qty: 1 },
            { materialName: '包装箱', spec: '瓦楞纸箱', unit: '个', qty: 1 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        code: 'GEN2K',
        name: '2kW家用发电机',
        description: '单相汽油发电机，173F动力，家用备电首选',
        unitPrice: 1980,
        bomItems: {
          create: [
            { materialName: '173F发动机', spec: '173F四冲程', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '单相2kW', unit: '个', qty: 1 },
            { materialName: '机架', spec: '钢管焊接加强型', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '5L', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '标准型', unit: '个', qty: 1 },
            { materialName: '空气滤清器', spec: '纸质型', unit: '个', qty: 1 },
            { materialName: '火花塞', spec: 'F7RTC', unit: '个', qty: 1 },
            { materialName: '控制面板', spec: '单相双插座+USB', unit: '套', qty: 1 },
            { materialName: '启动马达', spec: '12V', unit: '个', qty: 1 },
            { materialName: '蓄电池', spec: '12V 5Ah', unit: '个', qty: 1 },
            { materialName: '包装箱', spec: '瓦楞纸箱加固', unit: '个', qty: 1 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        code: 'GEN3KS',
        name: '3kW静音发电机',
        description: '单相静音汽油发电机，182F动力，噪音≤68dB',
        unitPrice: 3200,
        bomItems: {
          create: [
            { materialName: '182F发动机', spec: '182F四冲程OHV', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '单相3kW铜绕组', unit: '个', qty: 1 },
            { materialName: '静音外壳', spec: '钢板烤漆', unit: '套', qty: 1 },
            { materialName: '隔音棉', spec: '50mm厚', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '7L内置', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '静音型', unit: '个', qty: 1 },
            { materialName: '空气滤清器', spec: '双层纸质', unit: '个', qty: 1 },
            { materialName: '火花塞', spec: 'NGK BPR6ES', unit: '个', qty: 1 },
            { materialName: '控制面板', spec: '数字显示+AVR', unit: '套', qty: 1 },
            { materialName: '电启动系统', spec: '12V', unit: '套', qty: 1 },
            { materialName: '蓄电池', spec: '12V 7Ah免维护', unit: '个', qty: 1 },
            { materialName: '包装箱', spec: '木框纸箱', unit: '个', qty: 1 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        code: 'GEN5KT',
        name: '5kW三相发电机',
        description: '三相汽油发电机，GX390动力，工地/商用',
        unitPrice: 4800,
        bomItems: {
          create: [
            { materialName: 'GX390发动机', spec: '本田GX390 13HP', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '三相5kW铜绕组', unit: '个', qty: 1 },
            { materialName: '机架', spec: '重型钢管', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '15L', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '工业型', unit: '个', qty: 1 },
            { materialName: '空气滤清器', spec: '油浴式', unit: '个', qty: 1 },
            { materialName: '火花塞', spec: 'NGK BPR5ES', unit: '个', qty: 2 },
            { materialName: '控制面板', spec: '三相+单相面板', unit: '套', qty: 1 },
            { materialName: '电启动系统', spec: '12V带充电器', unit: '套', qty: 1 },
            { materialName: '蓄电池', spec: '12V 12Ah免维护', unit: '个', qty: 1 },
            { materialName: '轮子', spec: '充气轮', unit: '套', qty: 1 },
            { materialName: '出口木架', spec: '熏蒸木架', unit: '套', qty: 1 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        code: 'GEN5KD',
        name: '5kW柴油发电机',
        description: '单相柴油静音发电机组，186FA动力，220V/50Hz',
        unitPrice: 2850,
        bomItems: {
          create: [
            { materialName: '186FA柴油发动机', spec: '186FA单缸水冷', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '单相5kW', unit: '个', qty: 1 },
            { materialName: '静音外壳', spec: '黄色烤漆', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '12L', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '柴油静音型', unit: '个', qty: 1 },
            { materialName: '机油滤清器', spec: '标准型', unit: '个', qty: 1 },
            { materialName: '控制面板', spec: '单相+电流表', unit: '套', qty: 1 },
            { materialName: '电启动系统', spec: '12V', unit: '套', qty: 1 },
            { materialName: '蓄电池', spec: '12V 9Ah', unit: '个', qty: 1 },
            { materialName: '定制标签', spec: '客户品牌贴纸', unit: '套', qty: 1 },
            { materialName: '出口包装箱', spec: '木框瓦楞箱', unit: '个', qty: 1 },
          ],
        },
      },
    }),
    prisma.product.create({
      data: {
        code: 'GEN65',
        name: '6.5kW工业发电机',
        description: '单相/三相两用发电机，188F动力，工业重载',
        unitPrice: 6200,
        bomItems: {
          create: [
            { materialName: '188F发动机', spec: '188F四冲程15HP', unit: '台', qty: 1 },
            { materialName: '发电机头', spec: '6.5kW铜绕组AVR', unit: '个', qty: 1 },
            { materialName: '重型机架', spec: '50*50方管焊接', unit: '套', qty: 1 },
            { materialName: '燃油箱', spec: '25L', unit: '个', qty: 1 },
            { materialName: '消音器', spec: '工业大型', unit: '个', qty: 1 },
            { materialName: '空气滤清器', spec: '油浴双级', unit: '个', qty: 1 },
            { materialName: '火花塞', spec: 'F7RTC×2', unit: '套', qty: 1 },
            { materialName: '控制面板', spec: '智能数显三相', unit: '套', qty: 1 },
            { materialName: '电启动系统', spec: '12V带AMF', unit: '套', qty: 1 },
            { materialName: '蓄电池', spec: '12V 17Ah免维护', unit: '个', qty: 1 },
            { materialName: '轮子+把手', spec: '充气轮+折叠把', unit: '套', qty: 1 },
            { materialName: '接地装置', spec: '接地柱+线', unit: '套', qty: 1 },
            { materialName: '出口木架', spec: '熏蒸木架', unit: '套', qty: 1 },
          ],
        },
      },
    }),
  ]);

  console.log(`✓ 创建产品 ${products.length} 个`);

  // ---- Customers ----
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: '示例外贸客户 A',
        contact: '客户联系人 A',
        phone: '15888001234',
        email: 'demo-customer-a@example.com',
        address: '示例地址（脱敏占位）',
        rating: 'A',
        notes: '长期合作客户，主要出口南美，年采购量100+台',
        salespersonName: '张业务',
      },
    }),
    prisma.customer.create({
      data: {
        name: '广州恒威贸易有限公司',
        contact: '陈经理',
        phone: '13800112233',
        email: 'chen@hengwei.com',
        address: '广州市越秀区',
        rating: 'A',
        notes: '主营非洲市场，对柴油机需求量大',
        salespersonName: '李业务',
      },
    }),
    prisma.customer.create({
      data: {
        name: '上海联盛机械设备有限公司',
        contact: '王工',
        phone: '13900223344',
        email: 'wang@liansheng.com',
        address: '上海市嘉定区',
        rating: 'B',
        notes: '国内市场为主，工程机械配套',
        salespersonName: '王业务',
      },
    }),
    prisma.customer.create({
      data: {
        name: '浙江天力机电贸易有限公司',
        contact: '张总',
        phone: '13700334455',
        email: 'zhang@tianli.com',
        address: '浙江省金华市',
        rating: 'B',
        notes: '新客户，东南亚出口',
        salespersonName: '李业务',
      },
    }),
    prisma.customer.create({
      data: {
        name: '深圳南天电气有限公司',
        contact: '刘总',
        phone: '13600445566',
        email: 'liu@nantian.com',
        address: '深圳市龙华区',
        rating: 'C',
        notes: '偶尔采购，价格敏感',
        salespersonName: '张业务',
      },
    }),
  ]);

  console.log(`✓ 创建客户 ${customers.length} 个`);

  // ---- Communication Logs ----
  await prisma.commLog.createMany({
    data: [
      {
        customerId: customers[0].id,
        type: '拜访',
        outcome: '已成交',
        content: '拜访客户，确认36台柴油发电机组订单，交期3月30日',
        createdBy: '张业务',
        createdAt: new Date('2026-03-10'),
      },
      {
        customerId: customers[0].id,
        type: '电话',
        outcome: '正常',
        content: '跟进备料进度，客户催促交期',
        createdBy: '张业务',
        createdAt: new Date('2026-03-20'),
      },
      {
        customerId: customers[1].id,
        type: '展会',
        outcome: '待跟进',
        content: '广交会认识，对5kW柴油机感兴趣，需要100台报价',
        createdBy: '李业务',
        createdAt: new Date('2026-04-15'),
      },
    ],
  });

  // ---- Sample Orders ----
  const today = new Date();
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  // Order 1: shipped (completed)
  const order1 = await prisma.order.create({
    data: {
      contractNo: 'YMT2603001',
      customerId: customers[0].id,
      productId: products[4].id, // GEN5KD
      quantity: 10,
      unitPrice: 2850,
      totalAmount: 28500,
      deliveryDate: new Date('2026-03-30'),
      status: 'shipped',
      contractRef: '示例订单合同 20260320',
      createdBy: '张业务',
      purchaserName: '赵采购',
      materials: {
        create: [
          { name: '186FA柴油发动机', spec: '186FA单缸水冷', unit: '台', required: 10, status: 'ready' },
          { name: '发电机头', spec: '单相5kW', unit: '个', required: 10, status: 'ready' },
          { name: '静音外壳', spec: '黄色烤漆', unit: '套', required: 10, status: 'ready' },
          { name: '定制标签', spec: 'Unimomax品牌', unit: '套', required: 10, status: 'ready' },
        ],
      },
      approvalLog: {
        create: [
          { action: 'approved', fromStage: 'pending_approval', toStage: 'procurement', operator: '经理层', createdAt: new Date('2026-03-21') },
        ],
      },
    },
  });

  // Order 2: in production
  const order2 = await prisma.order.create({
    data: {
      contractNo: 'YMT2603002',
      customerId: customers[0].id,
      productId: products[4].id, // GEN5KD
      quantity: 5,
      unitPrice: 3400,
      totalAmount: 17000,
      deliveryDate: addDays(today, 12),
      status: 'production',
      contractRef: '示例订单合同 20260320',
      createdBy: '张业务',
      purchaserName: '赵采购',
      materials: {
        create: [
          { name: '柴油发动机', spec: '8kW机型', unit: '台', required: 5, status: 'ready' },
          { name: '发电机头', spec: '单相8kW', unit: '个', required: 5, status: 'ready' },
          { name: '静音外壳', spec: '定制款', unit: '套', required: 5, status: 'in_progress', urgent: true, notes: '厂家延期' },
        ],
      },
      approvalLog: {
        create: [
          { action: 'approved', fromStage: 'pending_approval', toStage: 'procurement', operator: '经理层', createdAt: addDays(today, -15) },
        ],
      },
    },
  });

  // Order 3: procurement (materials pending)
  const order3 = await prisma.order.create({
    data: {
      contractNo: 'YMT2603003',
      customerId: customers[1].id,
      productId: products[3].id, // GEN5KT
      quantity: 8,
      unitPrice: 4800,
      totalAmount: 38400,
      deliveryDate: addDays(today, 20),
      status: 'procurement',
      createdBy: '李业务',
      purchaserName: '钱采购',
      materials: {
        create: [
          { name: 'GX390发动机', spec: '本田GX390 13HP', unit: '台', required: 8, status: 'in_progress', expectedDate: addDays(today, 5) },
          { name: '发电机头', spec: '三相5kW铜绕组', unit: '个', required: 8, status: 'ready' },
          { name: '重型机架', spec: '钢管焊接', unit: '套', required: 8, status: 'pending', urgent: true, notes: '急需跟催' },
          { name: '出口木架', spec: '熏蒸木架', unit: '套', required: 8, status: 'pending' },
        ],
      },
      approvalLog: {
        create: [
          { action: 'approved', fromStage: 'pending_approval', toStage: 'procurement', operator: '经理层', createdAt: addDays(today, -8) },
        ],
      },
    },
  });

  // Order 4: pending_approval
  await prisma.order.create({
    data: {
      contractNo: 'YMT2604001',
      customerId: customers[2].id,
      productId: products[2].id, // GEN3KS
      quantity: 20,
      unitPrice: 3200,
      totalAmount: 64000,
      deliveryDate: addDays(today, 30),
      status: 'pending_approval',
      notes: '客户要求定制颜色：橙色',
      createdBy: '王业务',
      materials: {
        create: [
          { name: '182F发动机', spec: '182F OHV', unit: '台', required: 20, status: 'pending' },
          { name: '静音外壳', spec: '橙色定制', unit: '套', required: 20, status: 'pending' },
          { name: '发电机头', spec: '单相3kW', unit: '个', required: 20, status: 'pending' },
          { name: '控制面板', spec: 'AVR数字显示', unit: '套', required: 20, status: 'pending' },
        ],
      },
    },
  });

  // Order 5: draft
  await prisma.order.create({
    data: {
      contractNo: 'YMT2604002',
      customerId: customers[3].id,
      productId: products[5].id, // GEN65
      quantity: 5,
      unitPrice: 6200,
      totalAmount: 31000,
      deliveryDate: addDays(today, 45),
      status: 'draft',
      notes: '新客户，需要三相带AMF',
      createdBy: '李业务',
      materials: {
        create: [
          { name: '188F发动机', spec: '188F 15HP', unit: '台', required: 5, status: 'pending' },
          { name: '发电机头', spec: '6.5kW AVR', unit: '个', required: 5, status: 'pending' },
          { name: '智能控制面板', spec: 'AMF三相', unit: '套', required: 5, status: 'pending' },
        ],
      },
    },
  });

  // Order 6: ready_ship (overdue-ish)
  await prisma.order.create({
    data: {
      contractNo: 'YMT2603004',
      customerId: customers[1].id,
      productId: products[1].id, // GEN2K
      quantity: 30,
      unitPrice: 1980,
      totalAmount: 59400,
      deliveryDate: addDays(today, 3),
      status: 'ready_ship',
      createdBy: '李业务',
      purchaserName: '钱采购',
      materials: {
        create: [
          { name: '173F发动机', spec: '173F四冲程', unit: '台', required: 30, status: 'ready' },
          { name: '发电机头', spec: '单相2kW', unit: '个', required: 30, status: 'ready' },
        ],
      },
      approvalLog: {
        create: [
          { action: 'approved', fromStage: 'pending_approval', toStage: 'procurement', operator: '经理层', createdAt: addDays(today, -20) },
        ],
      },
    },
  });

  console.log('✓ 创建示例订单 6 个');
  console.log('🎉 种子数据初始化完成！');
}

main()
  .catch((e) => {
    console.error('❌ 种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
