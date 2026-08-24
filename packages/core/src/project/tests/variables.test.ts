import { describe, it, expect, afterEach } from 'vitest';
import { setVariables, getVariable } from '@/project/variables';

describe('project variables', () => {
    afterEach(() => setVariables()); // clear between tests

    it('registers a variable resolvable by name', () => {
        setVariables({ 'rounded-sm': 8 });
        expect(getVariable('rounded-sm')).toBe(8);
    });

    it('holds values of any type', () => {
        setVariables({
            radius: 8,
            ease: 'easeInOut',
            palette: [1, 2, 3],
            flags: { beta: true },
        });
        expect(getVariable('radius')).toBe(8);
        expect(getVariable('ease')).toBe('easeInOut');
        expect(getVariable('palette')).toEqual([1, 2, 3]);
        expect(getVariable('flags')).toEqual({ beta: true });
    });

    it('looks up case-insensitively', () => {
        setVariables({ 'Rounded-LG': 32 });
        expect(getVariable('rounded-lg')).toBe(32);
    });

    it('returns undefined for an unregistered variable', () => {
        setVariables({ 'rounded-sm': 8 });
        expect(getVariable('rounded-xl')).toBeUndefined();
    });

    it('clears variables when called with no argument', () => {
        setVariables({ 'rounded-sm': 8 });
        setVariables();
        expect(getVariable('rounded-sm')).toBeUndefined();
    });
});
