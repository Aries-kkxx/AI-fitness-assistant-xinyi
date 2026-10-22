// utils/bmi.js - BMI 计算工具
// 注意：BMI 仅作为辅助参考指标，不能作为医疗诊断依据
// 参考区间采用中国成人标准，仅用于展示参考

/**
 * 计算 BMI = 体重(kg) / 身高(m)²
 * @param {number} heightCm 身高（厘米）
 * @param {number} weightKg 体重（千克）
 * @returns {number} BMI 值（保留 1 位小数）；参数非法返回 null
 */
function calcBMI(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h <= 0 || w <= 0) return null;
  const m = h / 100; // 厘米转米
  return Math.round((w / (m * m)) * 10) / 10;
}

/**
 * BMI 参考区间（中国成人标准，仅供参考，非医疗诊断）
 * @param {number} bmi
 * @returns {string} 参考分类
 */
function getBMICategory(bmi) {
  if (bmi == null) return '';
  if (bmi < 18.5) return '偏瘦';
  if (bmi < 24) return '正常';
  if (bmi < 28) return '偏胖';
  return '肥胖';
}

module.exports = {
  calcBMI,
  getBMICategory
};
