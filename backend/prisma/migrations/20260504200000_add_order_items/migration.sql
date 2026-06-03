-- Make productId nullable
ALTER TABLE "Order" ALTER COLUMN "productId" DROP NOT NULL;

-- Add new aggregate columns to Order
ALTER TABLE "Order" ADD COLUMN "totalQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "itemCount"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "urgent"        BOOLEAN NOT NULL DEFAULT false;

-- Create OrderItem table
CREATE TABLE "OrderItem" (
  "id"            SERIAL NOT NULL,
  "orderId"       INTEGER NOT NULL,
  "productName"   TEXT NOT NULL DEFAULT '',
  "spec"          TEXT NOT NULL DEFAULT '',
  "customerBrand" TEXT NOT NULL DEFAULT '',
  "quantity"      INTEGER NOT NULL DEFAULT 1,
  "unitPrice"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subtotal"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remark"        TEXT NOT NULL DEFAULT '',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
