import { authed } from '../fetchHelper';

// ── Types ──

export type OrgOverview = {
  employees: number; departments: number; businessUnits: number;
  locations: number; legalEntities: number; designations: number; managers: number;
};

export type LegalEntity = {
  _id: string; name: string; legalName: string; registrationNo: string;
  gstNumber: string; panNumber: string; country: string; currency: string;
  address: string; dateOfIncorporation: string | null; authorizedSignatory: string; active: boolean;
};

export type BusinessUnit = {
  _id: string; name: string; description: string; code: string;
  headId: { _id: string; displayName: string; email: string } | null;
  email: string; legalEntityId: string | null; active: boolean;
};

export type OrgDepartment = {
  _id: string; name: string; description: string;
  businessUnitId: string | null;
  departmentHeadId: { _id: string; displayName: string; email: string } | null;
  parentDepartmentId: string | null; active: boolean;
};

export type OrgLocation = {
  _id: string; name: string; code: string; country: string; state: string;
  city: string; address: string; timezone: string; active: boolean;
};

export type Designation = {
  _id: string; title: string; grade: string; level: number;
  description: string; active: boolean;
};

export type DirectoryUser = {
  _id: string; displayName: string; email: string; employeeCode: string;
  roles: string[];
  departmentId: { _id: string; name: string } | null;
  designationId: { _id: string; title: string } | null;
  locationId: { _id: string; name: string; city: string } | null;
  reportingManagerId: { _id: string; displayName: string; email: string } | null;
  dottedLineManagerId: string | null;
  dateOfJoining: string | null; employmentType: string; phone: string;
  businessUnitId: string | null;
};

export type TreeUser = DirectoryUser;

// ── API calls ──

export const getOverview = () => authed('/org/overview') as Promise<OrgOverview>;

// Legal Entities
export const listLegalEntities = () => authed('/org/legal-entities') as Promise<LegalEntity[]>;
export const createLegalEntity = (body: Partial<LegalEntity>) => authed('/org/legal-entities', 'POST', body) as Promise<LegalEntity>;
export const updateLegalEntity = (id: string, body: Partial<LegalEntity>) => authed(`/org/legal-entities/${id}`, 'PATCH', body) as Promise<LegalEntity>;
export const deleteLegalEntity = (id: string) => authed(`/org/legal-entities/${id}`, 'DELETE');

// Business Units
export const listBusinessUnits = () => authed('/org/business-units') as Promise<BusinessUnit[]>;
export const createBusinessUnit = (body: Partial<BusinessUnit>) => authed('/org/business-units', 'POST', body) as Promise<BusinessUnit>;
export const updateBusinessUnit = (id: string, body: Partial<BusinessUnit>) => authed(`/org/business-units/${id}`, 'PATCH', body) as Promise<BusinessUnit>;
export const deleteBusinessUnit = (id: string) => authed(`/org/business-units/${id}`, 'DELETE');

// Departments
export const listOrgDepartments = () => authed('/org/departments') as Promise<OrgDepartment[]>;
export const createOrgDepartment = (body: Partial<OrgDepartment>) => authed('/org/departments', 'POST', body) as Promise<OrgDepartment>;
export const updateOrgDepartment = (id: string, body: Partial<OrgDepartment>) => authed(`/org/departments/${id}`, 'PATCH', body) as Promise<OrgDepartment>;
export const deleteOrgDepartment = (id: string) => authed(`/org/departments/${id}`, 'DELETE');

// Locations
export const listLocations = () => authed('/org/locations') as Promise<OrgLocation[]>;
export const createLocation = (body: Partial<OrgLocation>) => authed('/org/locations', 'POST', body) as Promise<OrgLocation>;
export const updateLocation = (id: string, body: Partial<OrgLocation>) => authed(`/org/locations/${id}`, 'PATCH', body) as Promise<OrgLocation>;
export const deleteLocation = (id: string) => authed(`/org/locations/${id}`, 'DELETE');

// Designations
export const listDesignations = () => authed('/org/designations') as Promise<Designation[]>;
export const createDesignation = (body: Partial<Designation>) => authed('/org/designations', 'POST', body) as Promise<Designation>;
export const updateDesignation = (id: string, body: Partial<Designation>) => authed(`/org/designations/${id}`, 'PATCH', body) as Promise<Designation>;
export const deleteDesignation = (id: string) => authed(`/org/designations/${id}`, 'DELETE');

export type DirectoryPage = {
  users: DirectoryUser[];
  total: number;
  page: number;
  pages: number;
};

// Directory & Tree
export const getDirectory = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return authed(`/org/directory${qs}`) as Promise<DirectoryPage>;
};
export const getOrgTree = () => authed('/org/tree') as Promise<TreeUser[]>;

// Employee job info
export const updateJobInfo = (id: string, body: Record<string, unknown>) =>
  authed(`/org/employees/${id}/job-info`, 'PATCH', body);
