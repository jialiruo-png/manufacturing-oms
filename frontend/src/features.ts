// 全站"新功能"通告中心：在此追加新条目，前端会自动以浅米黄横条形式提示用户。
// 用户关闭后通过 localStorage 标记 dismissed，下次登录不再显示。
// 头像菜单"更新日志"始终可查看全部历史条目。

export type FeatureCardCta = {
  label: string;
  // 当前直接接入 Tab 切换；如需跳转外链可再扩展为 type:'tab'|'url'。
  tabTarget?: string;
};

export type FeatureCard = {
  id: string; // dismiss 持久化的唯一键，发布后不可再改
  version: string; // 展示版本号 / 日期，便于用户辨识
  publishedAt: string; // YYYY-MM-DD
  title: string; // 一句话标题
  description: string; // 详细描述（一两句话）
  cta?: FeatureCardCta;
};

// ⚠️ 新增条目时：
// 1. 在数组最前面插入（最新在上）
// 2. id 取一个稳定 slug（如 `ai_image_parse_v1`），永不复用
// 3. 描述写人话，不超过两行
export const FEATURE_CARDS: FeatureCard[] = [
  {
    id: 'mobile_full_adaptation_v2',
    version: 'V2.0',
    publishedAt: '2026-05-16',
    title: '全面适配手机端',
    description:
      '所有业务模块（业务/采购/库存/生产/物流/审批/数据看板/用户管理）均支持手机浏览器使用；手机访问自动切换移动端布局，电脑端体验保持不变。',
  },
  {
    id: 'ai_excel_image_parse_v1',
    version: 'V1.1',
    publishedAt: '2026-05-15',
    title: '新建订单支持 AI 智能解析',
    description: 'Excel / 图片一键识别，自动填入客户、产品、数量、交期',
  },
];
