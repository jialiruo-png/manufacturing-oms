-- Run on the production PostgreSQL database after backing up RDS.
-- Uses Unicode escape literals so sensitive real names are not written plainly in the repository.

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "User" t
SET "name" = replace(t."name", r.real_name, r.demo_name)
FROM replacements r
WHERE t."name" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "User" t
SET "remark" = replace(t."remark", r.real_name, r.demo_name)
FROM replacements r
WHERE t."remark" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "PasswordResetRequest" t
SET "identifier" = replace(t."identifier", r.real_name, r.demo_name)
FROM replacements r
WHERE t."identifier" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Customer" t
SET "contact" = replace(t."contact", r.real_name, r.demo_name)
FROM replacements r
WHERE t."contact" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Customer" t
SET "notes" = replace(t."notes", r.real_name, r.demo_name)
FROM replacements r
WHERE t."notes" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Customer" t
SET "salespersonName" = replace(t."salespersonName", r.real_name, r.demo_name)
FROM replacements r
WHERE t."salespersonName" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "CommLog" t
SET "content" = replace(t."content", r.real_name, r.demo_name)
FROM replacements r
WHERE t."content" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "CommLog" t
SET "createdBy" = replace(t."createdBy", r.real_name, r.demo_name)
FROM replacements r
WHERE t."createdBy" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Order" t
SET "createdBy" = replace(t."createdBy", r.real_name, r.demo_name)
FROM replacements r
WHERE t."createdBy" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Order" t
SET "salespersonName" = replace(t."salespersonName", r.real_name, r.demo_name)
FROM replacements r
WHERE t."salespersonName" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Order" t
SET "purchaserName" = replace(t."purchaserName", r.real_name, r.demo_name)
FROM replacements r
WHERE t."purchaserName" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "Order" t
SET "notes" = replace(t."notes", r.real_name, r.demo_name)
FROM replacements r
WHERE t."notes" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "ApprovalLog" t
SET "operator" = replace(t."operator", r.real_name, r.demo_name)
FROM replacements r
WHERE t."operator" LIKE '%' || r.real_name || '%';

WITH replacements(real_name, demo_name) AS (
  VALUES
    (U&'\8D3E\4E3D\5A7C', '林嘉宁'),
    (U&'\97E6\5929\8BDA', '周启明')
)
UPDATE "ApprovalLog" t
SET "reason" = replace(t."reason", r.real_name, r.demo_name)
FROM replacements r
WHERE t."reason" LIKE '%' || r.real_name || '%';
