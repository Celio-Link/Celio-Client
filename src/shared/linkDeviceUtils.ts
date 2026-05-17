import {CommandType, LinkStatus, Mode} from './linkExchange/common';
import {StatusEmitterAbstract} from './linkExchange/statusEmitter/statusEmitter.abstract';


export class LinkDeviceUtils {
  static sendCancel(statusEmitter: StatusEmitterAbstract):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      statusEmitter.receiveCommand(CommandType.Cancel, new Uint8Array(0)).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send Cancel command'));
        }
        resolve();
      });
    });
  }

  private static enableLinkMode(statusEmitter: StatusEmitterAbstract):Promise<void> {
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    return new Promise<void>((resolve, reject) => {
      statusEmitter.receiveCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send SetMode command'));
        }
        resolve();
      })
    })
  }

  private static createReadyPromise(statusEmitter: StatusEmitterAbstract, timeoutMs = 2500): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const subscription = statusEmitter.status$().subscribe(status => {
        console.log("Status: " + LinkStatus[status]);
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

  static async tryEnableLinkMode(statusEmitter: StatusEmitterAbstract) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitForReady = this.createReadyPromise(statusEmitter);

    await this.sendCancel(statusEmitter);
    await delay(500);
    await this.enableLinkMode(statusEmitter);
    await waitForReady;
  }
}


