CREATE INDEX "User_status_deletedAt_idx" ON "User"("status", "deletedAt");
CREATE INDEX "User_role_status_deletedAt_idx" ON "User"("role", "status", "deletedAt");

CREATE INDEX "Customer_salespersonId_idx" ON "Customer"("salespersonId");

CREATE INDEX "CommLog_customerId_createdAt_idx" ON "CommLog"("customerId", "createdAt");

CREATE INDEX "Order_status_deliveryDate_createdAt_idx" ON "Order"("status", "deliveryDate", "createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "Order_deliveryDate_idx" ON "Order"("deliveryDate");

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE INDEX "Material_orderId_status_idx" ON "Material"("orderId", "status");
CREATE INDEX "Material_status_urgent_idx" ON "Material"("status", "urgent");

CREATE INDEX "ApprovalLog_orderId_createdAt_idx" ON "ApprovalLog"("orderId", "createdAt");
