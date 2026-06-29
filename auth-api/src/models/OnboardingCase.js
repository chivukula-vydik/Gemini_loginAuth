import mongoose from 'mongoose';
import crypto from 'crypto';

const STATUSES = [
  'DRAFT','OFFER_SENT','OFFER_ACCEPTED','PRE_BOARDING','JOINED',
  'INDUCTION','PROBATION','CONFIRMED','OFFER_DECLINED','CANCELLED','TERMINATED',
];

export const TERMINAL_STATES = new Set(['OFFER_DECLINED', 'CANCELLED', 'TERMINATED', 'CONFIRMED']);

export const VALID_TRANSITIONS = {
  DRAFT:           ['OFFER_SENT', 'CANCELLED'],
  OFFER_SENT:      ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'CANCELLED'],
  OFFER_ACCEPTED:  ['PRE_BOARDING', 'CANCELLED'],
  PRE_BOARDING:    ['JOINED', 'CANCELLED'],
  JOINED:          ['INDUCTION'],
  INDUCTION:       ['PROBATION'],
  PROBATION:       ['CONFIRMED', 'TERMINATED'],
};

const OnboardingCaseSchema = new mongoose.Schema({
  candidate: {
    firstName:     { type: String, required: true },
    lastName:      { type: String, required: true },
    personalEmail: { type: String, required: true },
    phone:         { type: String, default: '' },
  },
  designation:      { type: String, default: '' },
  department:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  payGrade:         { type: mongoose.Schema.Types.ObjectId, ref: 'PayGrade', default: null },
  payGroup:         { type: mongoose.Schema.Types.ObjectId, ref: 'PayGroup', default: null },
  candidateProfile: {
    dateOfBirth:              { type: Date, default: null },
    gender:                   { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    bloodGroup:               { type: String, default: '' },
    address:                  { type: String, default: '' },
    emergencyContactName:     { type: String, default: '' },
    emergencyContactPhone:    { type: String, default: '' },
    emergencyContactRelation: { type: String, default: '' },
    bankName:                 { type: String, default: '' },
    bankAccount:              { type: String, default: '' },
    ifsc:                     { type: String, default: '' },
    pan:                      { type: String, default: '' },
    aadhaar:                  { type: String, default: '' },
  },
  workLocation:     { type: String, default: '' },
  employmentType:   { type: String, enum: ['full_time', 'contract', 'intern'], default: 'full_time' },
  joiningDate:      { type: Date, required: true },
  probationMonths:  { type: Number, default: 3 },
  status: {
    type: String,
    enum: STATUSES,
    default: 'DRAFT',
    index: true,
  },
  workflowTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingTemplate', default: null },
  createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  convertedUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt:      { type: Date, default: null },
  portalTokenHash:  { type: String, default: null, index: true },
  portalTokenExpiry: { type: Date, default: null },
}, { timestamps: true });

OnboardingCaseSchema.methods.generatePortalToken = function () {
  const raw = crypto.randomBytes(24).toString('hex');
  this.portalTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiry = new Date(this.joiningDate);
  expiry.setDate(expiry.getDate() + 7);
  this.portalTokenExpiry = expiry;
  return raw;
};

OnboardingCaseSchema.statics.findByPortalToken = async function (raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const c = await this.findOne({ portalTokenHash: hash });
  if (!c || !c.portalTokenExpiry || c.portalTokenExpiry < new Date()) return null;
  return c;
};

export const OnboardingCase = mongoose.model('OnboardingCase', OnboardingCaseSchema);
