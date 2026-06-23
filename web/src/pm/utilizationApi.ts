import { authed } from '../fetchHelper';

export type EmployeeUtilization = {
  userId: string;
  displayName: string;
  email: string;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  utilizationPct: number;
};

export type UtilizationReport = {
  startDate: string;
  endDate: string;
  employees: EmployeeUtilization[];
  summary: {
    totalMinutes: number;
    billableMinutes: number;
    nonBillableMinutes: number;
    utilizationPct: number;
  };
};

export const getUtilization = (startDate: string, endDate: string) =>
  authed(`/reports/utilization?startDate=${startDate}&endDate=${endDate}`) as Promise<UtilizationReport>;
