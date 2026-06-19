import { Prisma } from '@prisma/client';

type ContractNumberTx = Prisma.TransactionClient;

const CONTRACT_LOCK_NAMESPACE = 'oms_contract_numbers';

function numberParts(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(year).slice(-2);

  return {
    period: `${year}-${month}`,
    contractPrefix: `HRM${yy}${month}`,
  };
}

async function lockContractNumberPeriod(tx: ContractNumberTx, period: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${CONTRACT_LOCK_NAMESPACE}), hashtext(${period}))
  `;
}

async function nextSerial(tx: ContractNumberTx, column: 'contractNo', prefix: string) {
  const suffixStart = prefix.length + 1;
  const col = Prisma.raw(`"${column}"`);
  const offset = Prisma.raw(String(suffixStart));
  const [row] = await tx.$queryRaw<Array<{ maxSerial: number | null }>>`
    SELECT MAX(SUBSTRING(${col} FROM ${offset})::int) AS "maxSerial"
    FROM "Order"
    WHERE ${col} LIKE ${`${prefix}%`}
      AND SUBSTRING(${col} FROM ${offset}) ~ '^[0-9]+$'
  `;
  return (row?.maxSerial ?? 0) + 1;
}

export async function generateContractNumber(tx: ContractNumberTx, date = new Date()) {
  const { period, contractPrefix } = numberParts(date);
  await lockContractNumberPeriod(tx, period);

  const contractSerial = await nextSerial(tx, 'contractNo', contractPrefix);

  return `${contractPrefix}${String(contractSerial).padStart(3, '0')}`;
}

export function isContractNumberConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('contractNo');
  }

  if (typeof target === 'string') {
    return target.includes('contractNo') ||
      target.includes('Order_contractNo_nonempty_key');
  }

  return false;
}

export async function withContractNumberRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isContractNumberConflict(error)) throw error;
    return operation();
  }
}
