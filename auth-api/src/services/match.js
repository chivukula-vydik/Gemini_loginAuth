export function skillsMatch(requiredSkillIds, userSkillIds) {
  const required = (requiredSkillIds || []).map(String);
  if (required.length === 0) return true;
  const have = new Set((userSkillIds || []).map(String));
  return required.some((id) => have.has(id));
}
