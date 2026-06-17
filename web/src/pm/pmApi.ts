import { getAccessToken } from '../api';
import type { Role } from './nav';

const API = 'http://localhost:4000';

async function authed(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.error) || `request failed (${r.status})`);
  return data;
}

export type Skill = { _id: string; name: string; active: boolean };
export type UserRow = { _id: string; email: string; displayName: string; role: Role; active?: boolean };
export type Person = { _id: string; displayName: string; email: string; role?: Role };
export type EditReq = {
  _id: string; userId: Person; weekStart: string; day: string; reason: string; status: string; createdAt: string;
  projectId?: { _id: string; name: string } | null;
};
export type Project = {
  _id: string; name: string; description: string; ownerPm: string;
  members: string[]; status: string; startDate: string | null; targetDate: string | null;
};
export type Task = {
  _id: string; project: string | { _id: string; name: string }; title: string;
  description: string; estimatedHours: number; requiredSkills: string[];
  assignee: string | null; status: string; dueDate: string | null;
  percentComplete?: number;
  actualMinutes?: number;
  proposedHours?: number;
  estimateStatus?: string;
  estimateValue?: number;
  estimateUnit?: 'hours' | 'days' | 'weeks';
  startDate?: string | null;
  proposedValue?: number;
  proposedUnit?: 'hours' | 'days' | 'weeks';
};
export type TaskDetail = {
  _id: string; title: string; description: string; estimatedHours: number;
  assignee: Person | null; status: string; percentComplete: number; actualMinutes: number;
  proposedHours?: number;
  estimateStatus?: string;
  estimateValue?: number;
  estimateUnit?: 'hours' | 'days' | 'weeks';
  startDate?: string | null;
  proposedValue?: number;
  proposedUnit?: 'hours' | 'days' | 'weeks';
};

export const listUsers = () => authed('/admin/users') as Promise<UserRow[]>;
export const setUserRole = (id: string, role: Role) => authed(`/admin/users/${id}/role`, 'PATCH', { role });
export const setUserActive = (id: string, active: boolean) =>
  authed(`/admin/users/${id}/active`, 'PATCH', { active }) as Promise<UserRow>;
export const deleteUser = (id: string) => authed(`/admin/users/${id}`, 'DELETE');

export const listSkills = () => authed('/skills') as Promise<Skill[]>;
export const addSkill = (name: string) => authed('/admin/skills', 'POST', { name }) as Promise<Skill>;
export const updateSkill = (id: string, patch: { name?: string; active?: boolean }) =>
  authed(`/admin/skills/${id}`, 'PATCH', patch) as Promise<Skill>;
export const setMySkills = (skillIds: string[]) => authed('/me/skills', 'PATCH', { skillIds });

export const listProjects = () => authed('/projects') as Promise<Project[]>;
export const createProject = (body: Partial<Project>) => authed('/projects', 'POST', body) as Promise<Project>;
export type ProjectDetailShape = Omit<Project, 'members' | 'ownerPm'> & { members: Person[]; ownerPm: Person };
export const getProject = (id: string) =>
  authed(`/projects/${id}`) as Promise<{ project: ProjectDetailShape; tasks: TaskDetail[] }>;
export const createTask = (projectId: string, body: Partial<Task> & { requiredSkills?: string[] }) =>
  authed(`/projects/${projectId}/tasks`, 'POST', body) as Promise<Task & { offered?: boolean }>;

export const updateProjectMembers = (id: string, members: string[]) =>
  authed(`/projects/${id}`, 'PATCH', { members });
export const setProjectOwner = (id: string, ownerPm: string) =>
  authed(`/projects/${id}`, 'PATCH', { ownerPm });
export const deleteProject = (id: string) => authed(`/projects/${id}`, 'DELETE');

export const myTasks = () => authed('/tasks/mine') as Promise<Task[]>;
export const listDirectory = () => authed('/users') as Promise<Person[]>;
export const setTaskProgress = (id: string, patch: { percentComplete?: number; status?: string }) =>
  authed(`/tasks/${id}/progress`, 'PATCH', patch);

export const listEditRequests = () => authed('/edit-requests?status=pending') as Promise<EditReq[]>;
export const decideEditRequest = (id: string, decision: 'approved' | 'denied') =>
  authed(`/edit-requests/${id}`, 'PATCH', { decision });
export type MarketTask = {
  _id: string; title: string; project: string; requiredSkills: string[];
  estimatedHours: number; myClaimStatus: 'none' | 'pending';
};
export type ClaimReq = {
  _id: string; user: Person; task: { _id: string; title: string }; project: { name: string };
  status: string; createdAt: string;
};
export type AssignmentOffer = {
  _id: string; task: { _id: string; title: string }; project: { name: string }; createdAt: string;
};

export const listMarketplace = () => authed('/marketplace') as Promise<MarketTask[]>;
export const claimTask = (id: string) => authed(`/tasks/${id}/claim`, 'POST');
export const listClaimRequests = () => authed('/claim-requests?status=pending') as Promise<ClaimReq[]>;
export const decideClaimRequest = (id: string, decision: 'approved' | 'denied') =>
  authed(`/claim-requests/${id}`, 'PATCH', { decision });

export type EstimateUnit = 'hours' | 'days' | 'weeks';
export const proposeEstimate = (id: string, value: number, unit: EstimateUnit) =>
  authed(`/tasks/${id}/estimate`, 'PATCH', { value, unit });
export const decideEstimate = (id: string, decision: 'approve' | 'reject') =>
  authed(`/tasks/${id}/estimate/decision`, 'PATCH', { decision });

export const listMyOffers = () => authed('/assignment-offers/mine') as Promise<AssignmentOffer[]>;
export const decideOffer = (id: string, decision: 'accept' | 'decline') =>
  authed(`/assignment-offers/${id}`, 'PATCH', { decision });
