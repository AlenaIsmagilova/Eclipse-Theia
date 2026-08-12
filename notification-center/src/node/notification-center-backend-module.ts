import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    NotificationClient,
    NotificationService,
    NOTIFICATION_SERVICE_PATH
} from '../common/notification-protocol';
import { NotificationServiceImpl } from './notification-service-impl';

export default new ContainerModule(bind => {
    bind(NotificationServiceImpl).toSelf().inSingletonScope();
    bind(NotificationService).toService(NotificationServiceImpl);
    bind(BackendApplicationContribution).toService(NotificationServiceImpl);

    bind(ConnectionHandler).toDynamicValue(({ container }) =>
        new RpcConnectionHandler<NotificationClient>(NOTIFICATION_SERVICE_PATH, client => {
            const service = container.get(NotificationServiceImpl);
            service.registerClient(client);
            return service;
        })
    ).inSingletonScope();
});
