CREATE UNIQUE INDEX IF NOT EXISTS "Order_contractNo_nonempty_key"
ON "Order"("contractNo")
WHERE "contractNo" <> '';
