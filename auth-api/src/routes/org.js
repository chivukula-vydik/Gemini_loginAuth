import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { LegalEntity } from '../models/LegalEntity.js';
import { BusinessUnit } from '../models/BusinessUnit.js';
import { Department } from '../models/Department.js';
import { Location } from '../models/Location.js';
import { Designation } from '../models/Designation.js';
import { User } from '../models/User.js';
import { Shift } from '../models/Shift.js';

export function createOrgRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // ── Public read endpoints (all authenticated users) ──

  router.get('/overview', asyncHandler(async (_req, res) => {
    const [employees, departments, businessUnits, locations, legalEntities, designations] = await Promise.all([
      User.countDocuments({ active: { $ne: false } }),
      Department.countDocuments({ active: { $ne: false } }),
      BusinessUnit.countDocuments({ active: { $ne: false } }),
      Location.countDocuments({ active: { $ne: false } }),
      LegalEntity.countDocuments({ active: { $ne: false } }),
      Designation.countDocuments({ active: { $ne: false } }),
    ]);
    const managers = await User.countDocuments({ active: { $ne: false }, _id: { $in: await User.distinct('reportingManagerId', { reportingManagerId: { $ne: null } }) } });
    res.json({ employees, departments, businessUnits, locations, legalEntities, designations, managers });
  }));

  router.get('/departments', asyncHandler(async (_req, res) => {
    const deps = await Department.find({ active: { $ne: false } }).populate('departmentHeadId', 'displayName email').sort('name');
    res.json(deps);
  }));

  router.get('/business-units', asyncHandler(async (_req, res) => {
    const bus = await BusinessUnit.find({ active: { $ne: false } }).populate('headId', 'displayName email').sort('name');
    res.json(bus);
  }));

  router.get('/locations', asyncHandler(async (_req, res) => {
    const locs = await Location.find({ active: { $ne: false } }).sort('name');
    res.json(locs);
  }));

  router.get('/designations', asyncHandler(async (_req, res) => {
    const desigs = await Designation.find({ active: { $ne: false } }).sort('level');
    res.json(desigs);
  }));

  router.get('/legal-entities', asyncHandler(async (_req, res) => {
    const entities = await LegalEntity.find({ active: { $ne: false } }).sort('name');
    res.json(entities);
  }));

  router.get('/shifts', asyncHandler(async (_req, res) => {
    const shifts = await Shift.find({ active: { $ne: false } }).sort('name');
    res.json(shifts);
  }));

  router.get('/directory', asyncHandler(async (req, res) => {
    const filter = { active: { $ne: false } };
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.businessUnitId) filter.businessUnitId = req.query.businessUnitId;
    if (req.query.locationId) filter.locationId = req.query.locationId;
    if (req.query.designationId) filter.designationId = req.query.designationId;
    if (req.query.reportingManagerId) filter.reportingManagerId = req.query.reportingManagerId;
    if (req.query.employmentType) filter.employmentType = req.query.employmentType;
    if (req.query.q) {
      const re = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ displayName: re }, { email: re }, { employeeCode: re }];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('displayName email employeeCode roles departmentId businessUnitId designationId locationId reportingManagerId dottedLineManagerId dateOfJoining employmentType phone')
        .populate('departmentId', 'name')
        .populate('designationId', 'title')
        .populate('locationId', 'name city')
        .populate('reportingManagerId', 'displayName email')
        .sort('displayName')
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  }));

  router.get('/tree', asyncHandler(async (_req, res) => {
    const users = await User.find({ active: { $ne: false } })
      .select('displayName email employeeCode roles departmentId designationId locationId reportingManagerId phone')
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('locationId', 'name')
      .sort('displayName');
    res.json(users);
  }));

  // ── Admin-only write endpoints ──
  const adminOnly = [requireFeature('organisation', { write: true })];

  // Legal Entities
  router.post('/legal-entities', ...adminOnly, asyncHandler(async (req, res) => {
    const { name, legalName, country, currency } = req.body || {};
    if (!name?.trim() || !legalName?.trim()) return res.status(400).json({ error: 'name and legalName required' });
    const entity = await LegalEntity.create({
      name: name.trim(), legalName: legalName.trim(),
      registrationNo: req.body.registrationNo || '', gstNumber: req.body.gstNumber || '',
      panNumber: req.body.panNumber || '', country: country || 'India',
      currency: currency || 'INR', address: req.body.address || '',
      dateOfIncorporation: req.body.dateOfIncorporation || null,
      authorizedSignatory: req.body.authorizedSignatory || '',
    });
    res.status(201).json(entity);
  }));

  router.patch('/legal-entities/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['name', 'legalName', 'registrationNo', 'gstNumber', 'panNumber', 'country', 'currency', 'address', 'dateOfIncorporation', 'authorizedSignatory', 'active'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f];
    const entity = await LegalEntity.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!entity) return res.status(404).json({ error: 'not found' });
    res.json(entity);
  }));

  router.delete('/legal-entities/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ legalEntityId: req.params.id });
    if (count > 0) return res.status(409).json({ error: `${count} employee(s) still under this entity` });
    await LegalEntity.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // Business Units
  router.post('/business-units', ...adminOnly, asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const bu = await BusinessUnit.create({
      name: name.trim(), description: req.body.description || '', code: req.body.code || '',
      headId: req.body.headId || null, email: req.body.email || '',
      legalEntityId: req.body.legalEntityId || null,
    });
    res.status(201).json(bu);
  }));

  router.patch('/business-units/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['name', 'description', 'code', 'headId', 'email', 'legalEntityId', 'active'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f];
    const bu = await BusinessUnit.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!bu) return res.status(404).json({ error: 'not found' });
    res.json(bu);
  }));

  router.delete('/business-units/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const deptCount = await Department.countDocuments({ businessUnitId: req.params.id });
    if (deptCount > 0) return res.status(409).json({ error: `${deptCount} department(s) still under this unit` });
    await BusinessUnit.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // Departments (enhanced)
  router.post('/departments', ...adminOnly, asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const dep = await Department.create({
      name: name.trim(), description: req.body.description || '',
      businessUnitId: req.body.businessUnitId || null,
      departmentHeadId: req.body.departmentHeadId || null,
      parentDepartmentId: req.body.parentDepartmentId || null,
    });
    res.status(201).json(dep);
  }));

  router.patch('/departments/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['name', 'description', 'businessUnitId', 'departmentHeadId', 'parentDepartmentId', 'active'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f];
    const dep = await Department.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!dep) return res.status(404).json({ error: 'not found' });
    res.json(dep);
  }));

  router.delete('/departments/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const empCount = await User.countDocuments({ departmentId: req.params.id });
    if (empCount > 0) return res.status(409).json({ error: `${empCount} employee(s) still in this department` });
    const childCount = await Department.countDocuments({ parentDepartmentId: req.params.id });
    if (childCount > 0) return res.status(409).json({ error: `${childCount} sub-department(s) exist` });
    await Department.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // Locations
  router.post('/locations', ...adminOnly, asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const loc = await Location.create({
      name: name.trim(), code: req.body.code || '', country: req.body.country || '',
      state: req.body.state || '', city: req.body.city || '', address: req.body.address || '',
      timezone: req.body.timezone || 'Asia/Kolkata',
    });
    res.status(201).json(loc);
  }));

  router.patch('/locations/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['name', 'code', 'country', 'state', 'city', 'address', 'timezone', 'active'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f];
    const loc = await Location.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!loc) return res.status(404).json({ error: 'not found' });
    res.json(loc);
  }));

  router.delete('/locations/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ locationId: req.params.id });
    if (count > 0) return res.status(409).json({ error: `${count} employee(s) still at this location` });
    await Location.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // Designations
  router.post('/designations', ...adminOnly, asyncHandler(async (req, res) => {
    const { title } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });
    const desig = await Designation.create({
      title: title.trim(), grade: req.body.grade || '',
      level: req.body.level ?? 0, description: req.body.description || '',
    });
    res.status(201).json(desig);
  }));

  router.patch('/designations/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['title', 'grade', 'level', 'description', 'active'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f];
    const desig = await Designation.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!desig) return res.status(404).json({ error: 'not found' });
    res.json(desig);
  }));

  router.delete('/designations/:id', ...adminOnly, asyncHandler(async (req, res) => {
    const count = await User.countDocuments({ designationId: req.params.id });
    if (count > 0) return res.status(409).json({ error: `${count} employee(s) with this designation` });
    await Designation.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));

  // Employee job info update
  router.patch('/employees/:id/job-info', ...adminOnly, asyncHandler(async (req, res) => {
    const fields = ['employeeCode', 'legalEntityId', 'businessUnitId', 'departmentId', 'designationId', 'locationId', 'shiftId', 'reportingManagerId', 'dottedLineManagerId', 'dateOfJoining', 'employmentType', 'probationEndDate', 'phone'];
    const update = {};
    for (const f of fields) if (req.body?.[f] !== undefined) update[f] = req.body[f] || null;
    if (req.body?.employeeCode) update.employeeCode = req.body.employeeCode;
    if (req.body?.employmentType) update.employmentType = req.body.employmentType;
    if (req.body?.phone !== undefined) update.phone = req.body.phone || '';

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('displayName email employeeCode legalEntityId businessUnitId departmentId designationId locationId shiftId reportingManagerId dottedLineManagerId dateOfJoining employmentType probationEndDate phone');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  return router;
}
