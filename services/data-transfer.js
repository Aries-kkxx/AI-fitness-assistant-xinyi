// services/data-transfer.js - 数据导出与导入（JSON/CSV）
// 导出：训练/饮水/体重/围度/恢复/AI 记忆/全部 → JSON（或单类型 CSV）
// 导入（仅 JSON）：校验格式 → 剥离 openid（强制当前用户，绝不覆盖他人）→
//   按唯一键防重复（已存在跳过，保留现有数据）→ 失败回滚本次已写入
const { getAllByWhere } = require('../utils/db');
const { formatDate, formatTime } = require('../utils/date');

const db = wx.cloud.database();
const APP_NAME = '健身小助手欣一';
const FORMAT = 'fitness-xinyi-export';
const VERSION = 1;

// ===== 导出 =====

async function collectAll() {
  const [workoutRecords, waterRecords, weightRecords, bodyMeasurements, recoveryRecords, fitnessMemory] =
    await Promise.all([
      getAllByWhere('workout_records', { _openid: '{openid}' }, { orderField: 'workout_date', orderDir: 'asc', max: 500 }),
      getAllByWhere('water_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 500 }),
      getAllByWhere('weight_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 200 }),
      getAllByWhere('body_measurements', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 200 }),
      getAllByWhere('recovery_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 200 }),
      getFitnessMemoryDoc()
    ]);
  return { workoutRecords, waterRecords, weightRecords, bodyMeasurements, recoveryRecords, fitnessMemory };
}

async function getFitnessMemoryDoc() {
  try {
    const res = await db
      .collection('fitness_memory')
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    return res.data.length > 0 ? res.data[0] : null;
  } catch (err) {
    return null;
  }
}

// 剥离服务端字段，输出干净数据
function cleanRecord(r) {
  const out = {};
  Object.keys(r).forEach((k) => {
    if (k === '_id' || k === '_openid' || k === 'openid' || k === 'created_at' || k === 'updated_at') return;
    out[k] = r[k];
  });
  return out;
}

/**
 * 构建导出数据
 * @param {Array<string>} types 导出类型（'all' 或子集）
 * @returns {Promise<{ json: string, jsonData: Object, csv: Object }>}
 */
async function buildExport(types) {
  const all = await collectAll();
  const want = (t) => types.indexOf('all') >= 0 || types.indexOf(t) >= 0;

  const data = {};
  if (want('workout_records')) data.workout_records = all.workoutRecords.map(cleanRecord);
  if (want('water_records')) data.water_records = all.waterRecords.map(cleanRecord);
  if (want('weight_records')) data.weight_records = all.weightRecords.map(cleanRecord);
  if (want('body_measurements')) data.body_measurements = all.bodyMeasurements.map(cleanRecord);
  if (want('recovery_records')) data.recovery_records = all.recoveryRecords.map(cleanRecord);
  if (want('fitness_memory')) data.fitness_memory = all.fitnessMemory ? cleanRecord(all.fitnessMemory) : null;

  const jsonData = {
    app: APP_NAME,
    format: FORMAT,
    version: VERSION,
    exported_at: formatDate(new Date()) + ' ' + formatTime(new Date()),
    types: Object.keys(data),
    data
  };
  const json = JSON.stringify(jsonData);

  // CSV（仅当导出单一类型时提供对应 CSV；all 时提供全部类型的 CSV）
  const csv = {};
  if (want('workout_records')) csv.workout_records = toCSV(data.workout_records, WORKOUT_COLS);
  if (want('water_records')) csv.water_records = toCSV(data.water_records, WATER_COLS);
  if (want('weight_records')) csv.weight_records = toCSV(data.weight_records, WEIGHT_COLS);
  if (want('body_measurements')) csv.body_measurements = toCSV(data.body_measurements, BODY_COLS);
  if (want('recovery_records')) csv.recovery_records = toCSV(data.recovery_records, RECOVERY_COLS);

  return { json, jsonData, csv };
}

// CSV 列定义
const WORKOUT_COLS = ['workout_date', 'exercise_id', 'exercise_name', 'plan_id', 'sets', 'reps', 'planned_sets', 'planned_reps', 'actual_sets', 'volume', 'note', 'completed', 'completed_at', 'duration_minutes', 'set_records'];
const WATER_COLS = ['date', 'drink_time', 'amount_ml', 'drink_type', 'remark'];
const WEIGHT_COLS = ['date', 'weight_kg'];
const BODY_COLS = ['date', 'body_fat_pct', 'waist_cm', 'chest_cm', 'hip_cm', 'arm_cm', 'thigh_cm'];
const RECOVERY_COLS = ['date', 'sleep_quality', 'fatigue', 'soreness', 'motivation', 'body_status', 'note'];

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(records, cols) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const head = cols.join(',');
  const rows = records.map((r) =>
    cols
      .map((c) => {
        let v = r[c];
        if (c === 'volume' && v === undefined && r.set_records) {
          // 训练容量：Σ 重量×次数（缺失时补算）
          v = (r.set_records || []).reduce((s, x) => s + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0);
        }
        if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
        return csvEscape(v);
      })
      .join(',')
  );
  return '\uFEFF' + head + '\n' + rows.join('\n'); // BOM 便于 Excel 识别中文
}

// ===== 导入 =====

/**
 * 解析并校验导出 JSON
 * @param {string} text
 * @returns {Object} { ok, data?, error? }
 */
function parseExport(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || obj.format !== FORMAT) {
      return { ok: false, error: '不是「健身小助手欣一」的导出文件（format 不匹配）' };
    }
    if (!obj.data || typeof obj.data !== 'object') {
      return { ok: false, error: '导出文件缺少 data 数据' };
    }
    return { ok: true, data: obj };
  } catch (err) {
    return { ok: false, error: 'JSON 解析失败：' + (err && err.message ? err.message : '格式错误') };
  }
}

// 各类型必填字段
const REQUIRED = {
  workout_records: ['workout_date', 'exercise_id'],
  water_records: ['date', 'amount_ml'],
  weight_records: ['date', 'weight_kg'],
  body_measurements: ['date'],
  recovery_records: ['date'],
  fitness_memory: [] // 对象即可
};

// 各类型唯一键（防重复）
const UNIQUE_KEYS = {
  workout_records: ['workout_date', 'exercise_id'],
  water_records: ['date', 'drink_time', 'amount_ml'],
  weight_records: ['date'],
  body_measurements: ['date'],
  recovery_records: ['date']
};

/**
 * 导入数据（校验 → 防重 → 写入 → 失败回滚；剥离 openid，不覆盖现有）
 * @param {Object} parsed parseExport 的结果
 * @param {Array<string>} types 要导入的类型
 * @returns {Promise<Object>} { ok, imported, skipped, failed, error? }
 */
async function importData(parsed, types) {
  const result = { ok: true, imported: 0, skipped: 0, failed: 0 };
  const writeIds = []; // 本次新增的文档 _id（用于回滚）

  try {
    for (const type of types) {
      if (!(type in parsed.data)) continue;
      const rows = parsed.data[type];

      if (type === 'fitness_memory') {
        if (rows && typeof rows === 'object') {
          const memoryService = require('./fitness-memory');
          await memoryService.saveFitnessMemory(stripOpenid(rows));
          result.imported++;
        }
        continue;
      }

      if (!Array.isArray(rows)) continue;
      // 已存在键集合（防重复）
      const existing = await fetchExistingKeys(type);
      for (const raw of rows) {
        const rec = stripOpenid(raw);
        if (!rec || typeof rec !== 'object') {
          result.failed++;
          continue;
        }
        // 必填校验
        const missing = (REQUIRED[type] || []).filter((k) => rec[k] === undefined || rec[k] === null || rec[k] === '');
        if (missing.length > 0) {
          result.failed++;
          continue;
        }
        // 防重复
        const key = uniqueKey(type, rec);
        if (existing.has(key)) {
          result.skipped++;
          continue;
        }
        // 写入（客户端 add 自动注入当前 _openid；rec 中 openid 已被剥离）
        const addData = sanitizeForWrite(type, rec);
        try {
          const res = await db.collection(COLLECTION_OF[type]).add({ data: addData });
          writeIds.push({ type, id: res._id });
          existing.add(key);
          result.imported++;
        } catch (err) {
          console.error('[data-transfer] 写入失败', type, err);
          result.failed++;
        }
      }
    }
    return result;
  } catch (err) {
    // 出错回滚：删除本次已写入的文档
    console.error('[data-transfer] 导入失败，回滚', err);
    for (let i = writeIds.length - 1; i >= 0; i--) {
      try {
        await db.collection(COLLECTION_OF[writeIds[i].type]).doc(writeIds[i].id).remove();
      } catch (rollbackErr) {
        // 忽略单条回滚失败
      }
    }
    return { ok: false, imported: 0, skipped: 0, failed: 0, error: '导入出错已回滚：' + (err && err.message ? err.message : '未知错误') };
  }
}

const COLLECTION_OF = {
  workout_records: 'workout_records',
  water_records: 'water_records',
  weight_records: 'weight_records',
  body_measurements: 'body_measurements',
  recovery_records: 'recovery_records'
};

// 剥离 openid 相关字段（强制当前用户，杜绝覆盖他人数据）
function stripOpenid(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const out = {};
  Object.keys(rec).forEach((k) => {
    if (k === '_openid' || k === 'openid' || k === '_id') return;
    out[k] = rec[k];
  });
  return out;
}

// 写入前清洗（类型安全）
function sanitizeForWrite(type, rec) {
  const out = {};
  Object.keys(rec).forEach((k) => {
    let v = rec[k];
    if (v === undefined) return;
    if (k === 'completed' || k === 'is_failure') v = !!v;
    if (typeof v === 'number' && !isFinite(v)) return;
    if (typeof v === 'object' && v !== null) v = JSON.parse(JSON.stringify(v));
    out[k] = v;
  });
  if (type === 'workout_records') {
    out.data_version = 2;
    out.updated_at = db.serverDate();
  }
  return out;
}

// 唯一键
function uniqueKey(type, rec) {
  return (UNIQUE_KEYS[type] || ['date']).map((k) => String(rec[k] || '')).join('|');
}

// 已存在键集合
async function fetchExistingKeys(type) {
  const set = new Set();
  try {
    const records = await getAllByWhere(COLLECTION_OF[type], { _openid: '{openid}' }, { max: 500 });
    records.forEach((r) => {
      set.add(uniqueKey(type, r));
    });
  } catch (err) {
    // 集合不存在等：视为无已存在
  }
  return set;
}

module.exports = {
  buildExport,
  parseExport,
  importData,
  FORMAT,
  toCSV
};
