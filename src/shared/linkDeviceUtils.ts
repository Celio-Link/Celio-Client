import {CommandType, LinkDeviceService, LinkStatus, Mode} from '../services/linkdevice.service';

export class LinkDeviceUtils {
  private static sendCancel(linkDeviceService: LinkDeviceService):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      linkDeviceService.sendCommand(CommandType.Cancel).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send Cancel command'));
        }
        resolve();
      });
    });
  }

  private static enableLinkMode(linkDeviceService: LinkDeviceService):Promise<void> {
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    return new Promise<void>((resolve, reject) => {
      linkDeviceService.sendCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send SetMode command'));
        }
        resolve();
      })
    })
  }

  private static createReadyPromise(linkDeviceService: LinkDeviceService, timeoutMs = 2500): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const subscription = linkDeviceService.statusEvents$.subscribe(status => {
        if (status === LinkStatus.DeviceReady) {
          cleanup();
          resolve();
        }
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for device to get ready'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        subscription.unsubscribe();
      };
    });
  }

  static async tryEnableLinkMode(linkDeviceService: LinkDeviceService) {
    const waitForReady = this.createReadyPromise(linkDeviceService);

    await this.sendCancel(linkDeviceService);
    await this.enableLinkMode(linkDeviceService);
    await waitForReady;
  }
}


