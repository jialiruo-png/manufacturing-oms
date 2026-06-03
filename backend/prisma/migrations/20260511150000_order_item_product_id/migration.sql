ALTER TABLE "OrderItem" ADD COLUMN "productId" INTEGER;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
