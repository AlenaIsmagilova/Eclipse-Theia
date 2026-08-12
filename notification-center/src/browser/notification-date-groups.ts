import { NotificationRecord } from '../common/notification-protocol';

export type NotificationDateGroupId = 'today' | 'yesterday' | 'earlier';

export interface NotificationDateGroup {
    readonly id: NotificationDateGroupId;
    readonly label: string;
    readonly records: readonly NotificationRecord[];
}

const GROUP_LABELS: Record<NotificationDateGroupId, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    earlier: 'Earlier'
};

const GROUP_ORDER: readonly NotificationDateGroupId[] = [
    'today',
    'yesterday',
    'earlier'
];

/** Groups records by the browser's local calendar date without mutating them. */
export function groupNotificationsByDate(
    records: readonly NotificationRecord[],
    now: Date = new Date()
): NotificationDateGroup[] {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const recordsByGroup = new Map<NotificationDateGroupId, NotificationRecord[]>();

    for (const record of [...records].sort((left, right) => right.createdAt - left.createdAt)) {
        const id = record.createdAt >= todayStart
            ? 'today'
            : record.createdAt >= yesterdayStart ? 'yesterday' : 'earlier';
        const groupRecords = recordsByGroup.get(id) ?? [];
        groupRecords.push(record);
        recordsByGroup.set(id, groupRecords);
    }

    return GROUP_ORDER.flatMap(id => {
        const groupRecords = recordsByGroup.get(id);
        return groupRecords?.length
            ? [{ id, label: GROUP_LABELS[id], records: groupRecords }]
            : [];
    });
}

/** Returns the delay until the next local midnight. */
export function millisecondsUntilNextLocalDay(now: Date = new Date()): number {
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1, nextDay.getTime() - now.getTime());
}
