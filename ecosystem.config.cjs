module.exports = {
  apps: [
    {
      name: 'manufacturing-oms-api',
      cwd: process.env.APP_ROOT ? `${process.env.APP_ROOT}/backend` : '/var/www/manufacturing-oms-v5/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3001',
      },
      max_memory_restart: '512M',
      error_file: '/var/log/manufacturing-oms/api-error.log',
      out_file: '/var/log/manufacturing-oms/api-out.log',
      time: true,
    },
  ],
};
