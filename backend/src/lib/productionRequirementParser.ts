export type RequirementParts = {
  powerModel: string;
  pumpBody: string;
  cabinet: string;
  frameMotor: string;
  panel: string;
  decal: string;
  carton: string;
  batteryCable: string;
  negatives: Set<string>;
};

const SIMPLE_NEGATIVE_RE = /(不贴|不装|不带|不需要|不配|无)([\u4e00-\u9fa5]{1,6})/g;

function normalizeText(value: string) {
  return value.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanSpec(value: string) {
  return normalizeText(value)
    .replace(/\s+柴油水泵$/, '')
    .replace(/[；;，,。].*$/, '')
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanSpec(match[1]);
    if (match?.[0]) return cleanSpec(match[0]);
  }
  return '';
}

function collectNegatives(text: string) {
  const negatives = new Set<string>();
  for (const match of text.matchAll(SIMPLE_NEGATIVE_RE)) {
    negatives.add(match[2]);
  }
  return negatives;
}

function hasNegative(negatives: Set<string>, keywords: string[], allowedPhrases: string[] = []) {
  return keywords.some((keyword) => {
    for (const negative of negatives) {
      if (allowedPhrases.includes(keyword)) continue;
      if (keyword === '电瓶线' && negative === '电瓶') continue;
      if (negative.includes(keyword) || keyword.includes(negative)) return true;
    }
    return false;
  });
}

export function parseProductionRequirement(detailRequirement: string, productName = ''): RequirementParts {
  const text = normalizeText(`${detailRequirement || ''} ${productName || ''}`);
  const negatives = collectNegatives(text);
  const powerModel = firstMatch(text, [
    /动力型号\s*[:：]?\s*([^；;，,。]+)/,
    /\b(17[08]\w*\s*[^；;，,。]*?(?:手启动|电启动|螺纹轴)?)/i,
    /\b(18[68]\w*\s*[^；;，,。]*?(?:手启动|电启动|螺纹轴)?)/i,
  ]);
  const pumpBody = firstMatch(text, [
    /泵体规格\s*[:：]?\s*([^；;，,。]+)/,
    /(\d+\s*寸[^；;，,。]*?泵)/,
  ]);
  const cabinet = firstMatch(text, [
    /颜色要求\s*[:：]?\s*([^；;。]+)/,
    /((?:红色|蓝色|黄色|黑色|白色|绿色|灰色)[^；;，,。]*(?:油箱|导风罩|机柜|外观)[^；;，,。]*)/,
  ]);
  const frameMotor = firstMatch(text, [
    /机架电机\s*[:：]?\s*([^；;，,。]+)/,
    /机架要求\s*[:：]?\s*([^；;，,。]+)/,
  ]);
  const panel = firstMatch(text, [
    /面板\s*[:：]?\s*([^；;，,。]+)/,
    /((?:单相|三相)[^；;，,。]*(?:面板|电压|频率|发电机组))/,
  ]);
  const rawDecal = firstMatch(text, [
    /品牌要求\s*[:：]?\s*([^；;。]*(?:贴花|标签)[^；;。]*)/,
    /客户品牌\s*[:：]?\s*([^；;。]*(?:贴花|标签)[^；;。]*)/,
    /([^；;，,。]*(?:贴花|标签)[^；;，,。]*)/,
  ]);
  const rawCarton = firstMatch(text, [
    /((?:中性|英文|彩色|牛皮|外箱)[^；;，,。]*(?:纸箱|包装|外箱)[^；;，,。]*)/,
    /((?:纸箱|外箱|包装)[^；;，,。]*)/,
  ]);
  const batteryCable = /电瓶线要带上|带电瓶线|电瓶线/.test(text) ? '电启动电瓶线' : '';

  return {
    powerModel,
    pumpBody,
    cabinet,
    frameMotor,
    panel,
    decal: hasNegative(negatives, ['贴花', '油箱贴花', '标签']) ? '' : rawDecal,
    carton: hasNegative(negatives, ['纸箱', '外箱', '包装']) ? '' : rawCarton,
    batteryCable: hasNegative(negatives, ['电瓶线']) ? '' : batteryCable,
    negatives,
  };
}
