import { expect } from 'chai';
import { NotificationRecord } from '../common/notification-protocol';
import {
    groupNotificationsByDate,
    millisecondsUntilNextLocalDay
} from './notification-date-groups';

describe('notification date groups', () => {
    const record = (id: string, createdAt: Date): NotificationRecord => ({
        id,
        severity: 'info',
        title: id,
        message: id,
        createdAt: createdAt.getTime()
    });

    it('groups by local calendar day and orders groups and records newest first', () => {
        const now = new Date(2026, 6, 15, 12, 0, 0);
        const records = [
            record('yesterday-old', new Date(2026, 6, 14, 8, 0, 0)),
            record('today-old', new Date(2026, 6, 15, 9, 0, 0)),
            record('earlier', new Date(2026, 6, 13, 23, 59, 59)),
            record('today-new', new Date(2026, 6, 15, 11, 0, 0)),
            record('yesterday-new', new Date(2026, 6, 14, 20, 0, 0))
        ];

        const groups = groupNotificationsByDate(records, now);

        expect(groups.map(group => group.label)).to.deep.equal(['Today', 'Yesterday', 'Earlier']);
        expect(groups.map(group => group.records.map(item => item.id))).to.deep.equal([
            ['today-new', 'today-old'],
            ['yesterday-new', 'yesterday-old'],
            ['earlier']
        ]);
    });

    it('handles month and year boundaries using local dates', () => {
        const groups = groupNotificationsByDate([
            record('new-year-today', new Date(2026, 0, 1, 1, 0, 0)),
            record('new-year-yesterday', new Date(2025, 11, 31, 23, 0, 0)),
            record('previous-month', new Date(2025, 11, 30, 23, 59, 59))
        ], new Date(2026, 0, 1, 12, 0, 0));

        expect(groups.map(group => [group.id, group.records[0].id])).to.deep.equal([
            ['today', 'new-year-today'],
            ['yesterday', 'new-year-yesterday'],
            ['earlier', 'previous-month']
        ]);
    });

    it('omits empty groups and does not mutate the input array', () => {
        const now = new Date(2026, 6, 15, 12, 0, 0);
        const records = [
            record('older', new Date(2026, 6, 15, 8, 0, 0)),
            record('newer', new Date(2026, 6, 15, 10, 0, 0))
        ];
        const originalIds = records.map(item => item.id);

        const groups = groupNotificationsByDate(records, now);

        expect(groups.map(group => group.id)).to.deep.equal(['today']);
        expect(groups[0].records.map(item => item.id)).to.deep.equal(['newer', 'older']);
        expect(records.map(item => item.id)).to.deep.equal(originalIds);
    });

    it('calculates the delay to the next local midnight', () => {
        const now = new Date(2026, 6, 15, 23, 59, 58, 500);

        expect(millisecondsUntilNextLocalDay(now)).to.equal(1500);
    });
});
