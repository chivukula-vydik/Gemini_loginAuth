import { ApprovalFlow } from '../models/ApprovalFlow.js';
import { ApprovalRequest } from '../models/ApprovalRequest.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';

/** Evaluate a simple condition against an entity */
function evalCondition(condition, entity) {
  if (!condition) return true;
  const val = entity[condition.field];
  if (val === undefined || val === null) return false;
  switch (condition.op) {
    case 'eq':  return val == condition.value; // eslint-disable-line eqeqeq
    case 'gt':  return val > condition.value;
    case 'gte': return val >= condition.value;
    case 'lt':  return val < condition.value;
    case 'lte': return val <= condition.value;
    default: return false;
  }
}

/** Pick the best matching active flow for an entity type + entity data. Priority wins. */
export async function selectFlow(entityType, entity) {
  const flows = await ApprovalFlow.find({
    'appliesTo.entityType': entityType,
    active: true,
  }).sort('priority').lean();

  for (const flow of flows) {
    if (evalCondition(flow.appliesTo.condition, entity)) return flow;
  }
  return null;
}

/** Resolve concrete approver userIds for a step, filtering out requester (self-approval). */
async function resolveStep(step, requesterId, entity) {
  let userIds = [];

  if (step.approverType === 'user') {
    userIds = step.approvers.map(id => id.toString());
  } else if (step.approverType === 'role') {
    const users = await User.find({
      roles: { $in: step.approvers },
      active: true,
    }).select('_id').lean();
    userIds = users.map(u => u._id.toString());
  } else if (step.approverType === 'manager') {
    const requester = await User.findById(requesterId).select('reportingManagerId').lean();
    if (requester?.reportingManagerId) {
      userIds = [requester.reportingManagerId.toString()];
    }
  } else if (step.approverType === 'project_manager') {
    const projectId = entity?.project || entity?.projectId;
    if (projectId) {
      const Project = mongoose.model('Project');
      const proj = await Project.findById(projectId).select('ownerPm').lean();
      if (proj?.ownerPm) userIds = [proj.ownerPm.toString()];
    }
  } else if (['team_lead', 'hr', 'director', 'vp'].includes(step.approverType)) {
    // ponytail: all four resolve the same — users with that role in requester's department
    const requester = await User.findById(requesterId).select('departmentId').lean();
    const query = { roles: step.approverType, active: true };
    if (requester?.departmentId) query.departmentId = requester.departmentId;
    const users = await User.find(query).select('_id').lean();
    userIds = users.map(u => u._id.toString());
  }

  // filter out self-approval
  return userIds.filter(id => id !== requesterId.toString());
}

/** Create a snapshot approval request from a flow template. */
export async function createApprovalRequest(flowId, entityType, entityId, requestedBy, entity) {
  const flow = await ApprovalFlow.findById(flowId).lean();
  if (!flow) throw new Error('flow not found');

  const snapshot = [];
  const resolvedApprovers = {};

  for (const step of flow.steps) {
    snapshot.push({
      order: step.order,
      name: step.name,
      approverType: step.approverType,
      rule: step.rule,
    });
    const approvers = await resolveStep(step, requestedBy, entity);
    if (approvers.length === 0) {
      throw new Error(`step "${step.name}" resolves to zero approvers`);
    }
    resolvedApprovers[String(step.order)] = approvers;
  }

  return ApprovalRequest.create({
    flowId,
    entityType,
    entityId,
    requestedBy,
    snapshot,
    resolvedApprovers,
    currentStep: 1,
    status: 'pending',
  });
}

/** Check if a step is satisfied based on recorded decisions */
function stepSatisfied(request, stepOrder) {
  const step = request.snapshot.find(s => s.order === stepOrder);
  if (!step) return false;
  const approvers = request.resolvedApprovers instanceof Map
    ? request.resolvedApprovers.get(String(stepOrder)) || []
    : (request.resolvedApprovers?.[String(stepOrder)] || []);
  const approvals = request.decisions.filter(
    d => d.stepOrder === stepOrder && d.decision === 'approve'
  );

  if (step.rule === 'all') {
    return approvers.every(a => approvals.some(d => d.approver.toString() === a.toString()));
  }
  // 'any'
  return approvals.length >= 1;
}

/** Record a decision and advance the request. Returns the updated request. */
export async function recordDecision(requestId, approverId, decision, comment) {
  const request = await ApprovalRequest.findById(requestId);
  if (!request) throw new Error('request not found');
  if (request.status !== 'pending') throw new Error(`request is already ${request.status}`);

  // verify approver is in resolvedApprovers for current step
  const stepApprovers = request.resolvedApprovers instanceof Map
    ? request.resolvedApprovers.get(String(request.currentStep)) || []
    : (request.resolvedApprovers?.[String(request.currentStep)] || []);
  if (!stepApprovers.some(a => a.toString() === approverId.toString())) {
    throw new Error('you are not an approver for the current step');
  }

  // check for duplicate decision
  const already = request.decisions.find(
    d => d.stepOrder === request.currentStep && d.approver.toString() === approverId.toString()
  );
  if (already) throw new Error('you have already decided on this step');

  request.decisions.push({
    stepOrder: request.currentStep,
    approver: approverId,
    decision,
    comment: comment || '',
    at: new Date(),
  });

  if (decision === 'reject') {
    request.status = 'rejected';
  } else if (stepSatisfied(request, request.currentStep)) {
    const maxStep = Math.max(...request.snapshot.map(s => s.order));
    if (request.currentStep >= maxStep) {
      request.status = 'approved';
    } else {
      request.currentStep += 1;
    }
  }

  await request.save();
  return request;
}

/** Validate a flow template before saving */
export function validateFlow(flow) {
  const errors = [];
  if (!flow.name?.trim()) errors.push('name is required');
  if (!flow.appliesTo?.entityType?.trim()) errors.push('entityType is required');
  if (!flow.steps?.length) errors.push('at least one step is required');
  if (flow.steps) {
    for (const step of flow.steps) {
      if (!step.name?.trim()) errors.push(`step ${step.order}: name is required`);
      const autoResolved = ['manager', 'project_manager', 'team_lead', 'hr', 'director', 'vp'];
      if (!autoResolved.includes(step.approverType) && (!step.approvers?.length)) {
        errors.push(`step "${step.name || step.order}": at least one approver is required`);
      }
    }
  }
  return errors;
}

/** Seed default flows if none exist */
export async function seedDefaultFlows() {
  const count = await ApprovalFlow.countDocuments();
  if (count > 0) return;

  await ApprovalFlow.insertMany([
    {
      name: 'Reimbursement Approval',
      appliesTo: { entityType: 'reimbursement' },
      steps: [
        { order: 1, name: 'Reporting Manager', approverType: 'manager', approvers: [], rule: 'any' },
        { order: 2, name: 'Finance', approverType: 'role', approvers: ['finance'], rule: 'any' },
      ],
      priority: 0,
      active: true,
    },
    {
      name: 'Leave Approval',
      appliesTo: { entityType: 'leave' },
      steps: [
        { order: 1, name: 'Reporting Manager', approverType: 'manager', approvers: [], rule: 'any' },
      ],
      priority: 0,
      active: true,
    },
  ]);
}
