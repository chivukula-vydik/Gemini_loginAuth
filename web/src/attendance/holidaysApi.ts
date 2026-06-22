import { authed } from '../fetchHelper';

export type Holiday = { _id: string; date: string; name: string; year: number };

export const getHolidays = (year: number) =>
  authed(`/holidays?year=${year}`) as Promise<Holiday[]>;

export const addHoliday = (date: string, name: string) =>
  authed('/holidays', 'POST', { date, name }) as Promise<Holiday>;

export const deleteHoliday = (id: string) =>
  authed(`/holidays/${id}`, 'DELETE');
