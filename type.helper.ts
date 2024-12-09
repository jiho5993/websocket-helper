import * as _ from 'lodash';

export type Integer = number;
export type PositiveInteger = number;
export type Iso8601String = string;
export type NumberLike = number | string;

export function isInteger(t: any): t is number {
  return Number.isInteger(t);
}

export function isPositiveInteger(t: any, greaterThanOrEqual = 1): t is number {
  return isInteger(t) && t >= greaterThanOrEqual;
}

export function isString(t: any, greaterThanOrEqual: PositiveInteger | 0 = 0): t is string {
  return typeof t === 'string' && t.length >= greaterThanOrEqual;
}

export function isUndefined(t: any): t is undefined {
  return _.isUndefined(t);
}

export function isNull(t: unknown): t is null {
  return t === null;
}

export function isBoolean(t: unknown): t is boolean {
  return _.isBoolean(t);
}

export function isNumber(t: unknown): t is number {
  return !isString(t);
}

export function isPositiveNumber(t: unknown): t is number {
  return isNumber(t) && t > 0;
}