import { authed } from '../fetchHelper';
import type { Role } from './nav';
import type { Reputation } from './reputation';

export type Skill = { _id: string; name: string; active: boolean };
export type UserRow = { _id: string; email: string; displayName: string; roles: Role[]; active?: boolean; reestimationCount?: number; reportingManagerId?: string | null; departmentId?: string | null; shiftId?: string | null };
export type Person = { _id: string; displayName: string; email: string; role?: Role };
export type EditReq = {
  _id: string; userId: Person; weekStart: string; day: string; reason: string; status: string; createdAt: string;
  projectId?: { _id: string; name: string } | null;
};
export type Project = {
  _id: string; name: string; description: string; ownerPm: string;
  members: string[]; requiredSkills?: string[]; status: string; startDate: string | null; targetDate: string | null;
  progress?: number; taskCount?: number; doneCount?: number;
  clientName?: string; billingType?: 'billable' | 'non-billable' | 'milestone' | 'hourly' | 'fixed-price'; billingRate?: number | null; currency?: string | null;
  milestones?: Milestone[];
  phases?: Phase[];
  activePhase?: string | null;
};
export type Milestone = { _id?: string; name: string; amount: number; description?: string; status?: string };
export type Phase = { _id: string; name: string; description: string; order: number; status: 'upcoming' | 'active' | 'completed' };
export type Availability = 'available' | 'standby' | 'busy';
export type PastRecord = { total: number; approved: number; rejected: number; pending: number };
export type Candidate = {
  _id: string; displayName: string; email: string; role: Role;
  status: Availability; loadPct: number; hours: number; capacity: number;
  skillsOk: boolean; matchedSkills: string[]; missingSkills: string[];
  activeTaskCount: number; isMember: boolean;
};
export type CandidatesResponse = {
  capacity: number; requiredSkills: { _id: string; name: string }[]; candidates: Candidate[];
};
export type Assignee = { user: Person | string; sharePct: number; estimatedHours?: number | null; etaAt?: string | null };
export type Task = {
  _id: string; project: string | { _id: string; name: string }; title: string;
  description: string; estimatedHours: number; requiredSkills: string[];
  assignees: Assignee[]; status: string; dueDate: string | null;
  mySharePct?: number;
  myEstimatedHours?: number | null;
  myPendingHours?: number | null;
  myPendingValue?: number;
  myPendingUnit?: EstimateUnit;
  myPendingReason?: string;
  myEstimateStatus?: 'none' | 'pending';
  myEtaAt?: string | null;
  myDue?: string | null;
  estimatesPending?: boolean;
  submittedCount?: number;
  assigneeCount?: number;
  effectiveDueDate?: string | null;
  dueDateAuto?: boolean;
  dueProposalStatus?: 'none' | 'proposed' | 'approved' | 'rejected';
  dueProposalValue?: number;
  dueProposalUnit?: 'hours' | 'days' | 'weeks';
  dueProposalDate?: string | null;
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
  phaseId?: string | null;
  assignees: { user: Person; sharePct: number; estimatedHours?: number | null; etaAt?: string | null }[]; status: string; percentComplete: number; actualMinutes: number;
  proposedHours?: number;
  estimateStatus?: string;
  estimateValue?: number;
  estimateUnit?: 'hours' | 'days' | 'weeks';
  startDate?: string | null;
  dueDate?: string | null;
  effectiveDueDate?: string | null;
  dueDateAuto?: boolean;
  dueProposalStatus?: 'none' | 'proposed' | 'approved' | 'rejected';
  dueProposalValue?: number;
  dueProposalUnit?: 'hours' | 'days' | 'weeks';
  dueProposalDate?: string | null;
  proposedValue?: number;
  proposedUnit?: 'hours' | 'days' | 'weeks';
};

export type Department = { _id: string; name: string; description: string; active: boolean };
export type ShiftDef = { _id: string; name: string; startHour: number; startMinute: number; endHour: number; endMinute: number; isDefault: boolean; active: boolean };

export const listDepartments = () => authed('/admin/departments') as Promise<Department[]>;
export const createDepartment = (name: string, description?: string) => authed('/admin/departments', 'POST', { name, description }) as Promise<Department>;
export const updateDepartment = (id: string, patch: Partial<Department>) => authed(`/admin/departments/${id}`, 'PATCH', patch) as Promise<Department>;
export const deleteDepartment = (id: string) => authed(`/admin/departments/${id}`, 'DELETE');

export const listShifts = () => authed('/admin/shifts') as Promise<ShiftDef[]>;
export const createShift = (body: Partial<ShiftDef>) => authed('/admin/shifts', 'POST', body) as Promise<ShiftDef>;
export const updateShift = (id: string, patch: Partial<ShiftDef>) => authed(`/admin/shifts/${id}`, 'PATCH', patch) as Promise<ShiftDef>;
export const deleteShift = (id: string) => authed(`/admin/shifts/${id}`, 'DELETE');

export const setUserDepartment = (id: string, departmentId: string | null) => authed(`/admin/users/${id}/department`, 'PATCH', { departmentId });
export const setUserShift = (id: string, shiftId: string | null) => authed(`/admin/users/${id}/shift`, 'PATCH', { shiftId });

export const listPublicDepartments = () => authed('/org/departments') as Promise<{ _id: string; name: string; description: string }[]>;
export const listPublicShifts = () => authed('/org/shifts') as Promise<ShiftDef[]>;

export const listUsers = () => authed('/admin/users') as Promise<UserRow[]>;
export const setUserRoles = (id: string, roles: Role[]) => authed(`/admin/users/${id}/roles`, 'PATCH', { roles });
export const setUserActive = (id: string, active: boolean) =>
  authed(`/admin/users/${id}/active`, 'PATCH', { active }) as Promise<UserRow>;
export const deleteUser = (id: string) => authed(`/admin/users/${id}`, 'DELETE');
export const setReportingManager = (id: string, reportingManagerId: string | null) =>
  authed(`/admin/users/${id}/reporting-manager`, 'PATCH', { reportingManagerId });

export type ReestimationEntry = {
  taskId: string; taskTitle: string; projectId: string | null; projectName: string;
  fromHours: number; value: number; unit: 'hours' | 'days' | 'weeks'; toHours: number;
  reason: string; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; decidedAt: string | null;
};
export type ReestimationHistory = { summary: PastRecord; entries: ReestimationEntry[] };
export const getUserReestimations = (id: string) =>
  authed(`/users/${id}/reestimations`) as Promise<ReestimationHistory>;
export const getReestimationSummary = () =>
  authed('/users/reestimations/summary') as Promise<{ requesters: number }>;

export const listSkills = () => authed('/skills') as Promise<Skill[]>;
export const addSkill = (name: string) => authed('/admin/skills', 'POST', { name }) as Promise<Skill>;
export const updateSkill = (id: string, patch: { name?: string; active?: boolean }) =>
  authed(`/admin/skills/${id}`, 'PATCH', patch) as Promise<Skill>;
export const setMySkills = (skillIds: string[]) => authed('/me/skills', 'PATCH', { skillIds });

export const listProjects = () => authed('/projects') as Promise<Project[]>;
export const createProject = (body: Partial<Project>) => authed('/projects', 'POST', body) as Promise<Project>;
export type ProjectDetailShape = Omit<Project, 'members' | 'ownerPm' | 'requiredSkills'> & {
  members: Person[]; ownerPm: Person; requiredSkills: { _id: string; name: string }[];
};
export const getProject = (id: string) =>
  authed(`/projects/${id}`) as Promise<{ project: ProjectDetailShape; tasks: TaskDetail[] }>;
export const createTask = (projectId: string, body: Omit<Partial<Task>, 'assignees'> & { requiredSkills?: string[]; assignees?: string[]; phaseId?: string | null }) =>
  authed(`/projects/${projectId}/tasks`, 'POST', body) as Promise<Task>;

export type BulkTaskOp = 'status' | 'assignee' | 'delete';
export const bulkUpdateTasks = (projectId: string, taskIds: string[], op: BulkTaskOp, value?: string) =>
  authed(`/projects/${projectId}/tasks/bulk`, 'PATCH', { taskIds, op, value });

export const setTaskAssignees = (taskId: string, assignees: { user: string; sharePct: number }[]) =>
  authed(`/tasks/${taskId}/assignees`, 'PATCH', { assignees }) as Promise<Task>;

export const updateTask = (id: string, patch: Partial<Task>) =>
  authed(`/tasks/${id}`, 'PATCH', patch) as Promise<Task>;

export const setMyEstimate = (id: string, value: number, unit: EstimateUnit, reason?: string) =>
  authed(`/tasks/${id}/my-estimate`, 'PATCH', { value, unit, reason }) as Promise<Task>;
export const setMyEta = (id: string, etaAt: string | null) =>
  authed(`/tasks/${id}/my-eta`, 'PATCH', { etaAt }) as Promise<Task>;
export const decideMyEstimate = (id: string, userId: string, decision: 'approve' | 'reject') =>
  authed(`/tasks/${id}/my-estimate/decision`, 'PATCH', { userId, decision }) as Promise<Task>;

export const proposeExtension = (id: string, value: number, unit: EstimateUnit) =>
  authed(`/tasks/${id}/extension`, 'PATCH', { value, unit });
export const decideExtension = (id: string, decision: 'approve' | 'reject') =>
  authed(`/tasks/${id}/extension/decision`, 'PATCH', { decision });

export const updateProjectMembers = (id: string, members: string[]) =>
  authed(`/projects/${id}`, 'PATCH', { members });
export const updateProjectDescription = (id: string, description: string) =>
  authed(`/projects/${id}`, 'PATCH', { description });
export const updateProjectRequiredSkills = (id: string, requiredSkills: string[]) =>
  authed(`/projects/${id}`, 'PATCH', { requiredSkills });
export const listCandidates = (projectId: string) =>
  authed(`/projects/${projectId}/candidates`) as Promise<CandidatesResponse>;
export const listReputation = () =>
  authed('/users/reputation') as Promise<{ people: Reputation[] }>;
export const setProjectOwner = (id: string, ownerPm: string) =>
  authed(`/projects/${id}`, 'PATCH', { ownerPm });
export const deleteProject = (id: string) => authed(`/projects/${id}`, 'DELETE');

export const addPhase = (projectId: string, name: string, description?: string) =>
  authed(`/projects/${projectId}/phases`, 'POST', { name, description }) as Promise<Phase[]>;
export const updatePhase = (projectId: string, phaseId: string, patch: Partial<Phase>) =>
  authed(`/projects/${projectId}/phases/${phaseId}`, 'PATCH', patch) as Promise<Phase[]>;
export const advancePhase = (projectId: string) =>
  authed(`/projects/${projectId}/phases/advance`, 'POST') as Promise<Phase[]>;
export const deletePhase = (projectId: string, phaseId: string) =>
  authed(`/projects/${projectId}/phases/${phaseId}`, 'DELETE') as Promise<Phase[]>;

export const myTasks = () => authed('/tasks/mine') as Promise<Task[]>;
export const listDirectory = () => authed('/users') as Promise<Person[]>;
export const setTaskProgress = (id: string, patch: { percentComplete?: number; status?: string }) =>
  authed(`/tasks/${id}/progress`, 'PATCH', patch);

export const listEditRequests = () => authed('/edit-requests?status=pending') as Promise<EditReq[]>;
export const decideEditRequest = (id: string, decision: 'approved' | 'denied') =>
  authed(`/edit-requests/${id}`, 'PATCH', { decision });
export type MarketTask = {
  _id: string; title: string; description: string; project: string; requiredSkills: string[];
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

export type SubmittedTimesheet = {
  _id: string; user: Person | null; weekStart: string; submittedAt: string | null; totalMinutes: number;
};
export const listSubmittedTimesheets = () =>
  authed('/timesheets/review?status=submitted') as Promise<SubmittedTimesheet[]>;
export const decideTimesheet = (id: string, decision: 'approve' | 'return') =>
  authed(`/timesheets/review/${id}`, 'PATCH', { decision });

export type TimesheetNote = { taskName: string; day: string; minutes: number; note: string };
export const getTimesheetNotes = (id: string) =>
  authed(`/timesheets/review/${id}/notes`) as Promise<TimesheetNote[]>;
