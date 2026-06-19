import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function textFromCodePoints(points: number[]) {
  return String.fromCodePoint(...points);
}

const replacements = [
  [textFromCodePoints([0x8d3e, 0x4e3d, 0x5a7c]), '林嘉宁'],
  [textFromCodePoints([0x97e6, 0x5929, 0x8bda]), '周启明'],
] as const;

const textColumns = [
  ['User', 'name'],
  ['User', 'remark'],
  ['PasswordResetRequest', 'identifier'],
  ['Customer', 'contact'],
  ['Customer', 'notes'],
  ['Customer', 'salespersonName'],
  ['CommLog', 'content'],
  ['CommLog', 'createdBy'],
  ['Order', 'createdBy'],
  ['Order', 'salespersonName'],
  ['Order', 'purchaserName'],
  ['Order', 'notes'],
  ['ApprovalLog', 'operator'],
  ['ApprovalLog', 'reason'],
] as const;

async function replaceInColumn(table: string, column: string, realName: string, demoName: string) {
  return prisma.$executeRaw`
    UPDATE ${Prisma.raw(`"${table}"`)}
    SET ${Prisma.raw(`"${column}"`)} = replace(${Prisma.raw(`"${column}"`)}, ${realName}, ${demoName})
    WHERE ${Prisma.raw(`"${column}"`)} LIKE ${`%${realName}%`}
  `;
}

async function main() {
  let totalUpdated = 0;

  for (const [realName, demoName] of replacements) {
    for (const [table, column] of textColumns) {
      const updated = await replaceInColumn(table, column, realName, demoName);
      totalUpdated += Number(updated);
      if (Number(updated) > 0) {
        console.log(`✓ ${table}.${column}: replaced sensitive name with ${demoName}, ${updated} rows`);
      }
    }
  }

  console.log(`完成真实姓名脱敏，共更新 ${totalUpdated} 处表字段记录。`);
}

main()
  .catch((error) => {
    console.error('真实姓名脱敏失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
