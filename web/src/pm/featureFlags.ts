function envBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

export const PM_FLAGS = {
  taskTools: envBool(import.meta.env.VITE_FF_PM_TASK_TOOLS, true),
  taskBulk: envBool(import.meta.env.VITE_FF_PM_TASK_BULK, true),
};
