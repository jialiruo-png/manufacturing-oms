import app from './app';
import { ensureDefaultAdmin } from './routes/users';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  await ensureDefaultAdmin();

  app.listen(PORT, HOST, () => {
    console.log(`🚀 后端服务运行在 http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error('后端服务启动失败:', error);
  process.exit(1);
});
