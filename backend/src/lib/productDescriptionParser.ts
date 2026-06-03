export type ProductDescriptionParts = {
  productName: string;
  detailRequirement: string;
};

const REQUIREMENT_HINTS = [
  '产品型号',
  '动力型号',
  '泵体规格',
  '颜色要求',
  '品牌要求',
  '客户品牌',
  '贴花',
  '纸箱',
  '包装',
  '外箱',
  '标签',
  '颜色',
  '具体款式',
  '机柜',
  '机架',
  '面板',
  '电瓶',
  '底阀',
];

function cleanProductName(value: string) {
  return value
    .replace(/^[\s/，,；;、-]+|[\s/，,；;、-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSourcePrefix(value: string) {
  return value.replace(/^\s*(?:ATC-\d+|\d+|No\.?\s*\d*)\s*[:：、,，.\-]?\s*/i, '').trim();
}

function looksLikeRequirementStart(text: string) {
  return REQUIREMENT_HINTS.some((hint) => text.includes(hint));
}

export function parseProductDescription(description: string): ProductDescriptionParts {
  const text = stripSourcePrefix(String(description || '').replace(/\u3000/g, ' ').trim());
  if (!text) return { productName: '', detailRequirement: '' };

  const paren = text.match(/^(.+?)[（(]([\s\S]+)[）)]$/);
  if (paren) {
    return {
      productName: cleanProductName(paren[1]),
      detailRequirement: paren[2].trim(),
    };
  }

  const slashParts = text.split(/\s*\/\s*/).filter(Boolean);
  if (slashParts.length > 1) {
    const firstRequirementIdx = slashParts.findIndex((part, idx) => idx > 0 && looksLikeRequirementStart(part));
    if (firstRequirementIdx > 0) {
      return {
        productName: cleanProductName(slashParts.slice(0, firstRequirementIdx).join('/')),
        detailRequirement: slashParts.slice(firstRequirementIdx).join('；'),
      };
    }
    return {
      productName: cleanProductName(slashParts[0]),
      detailRequirement: slashParts.slice(1).join('；'),
    };
  }

  const labelIdx = REQUIREMENT_HINTS
    .map((hint) => text.indexOf(hint))
    .filter((idx) => idx > 0)
    .sort((a, b) => a - b)[0];
  if (labelIdx > 0) {
    return {
      productName: cleanProductName(text.slice(0, labelIdx)),
      detailRequirement: text.slice(labelIdx).trim(),
    };
  }

  return {
    productName: cleanProductName(text),
    detailRequirement: '',
  };
}
