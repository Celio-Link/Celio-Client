import {CommandType, LinkStatus, FirmwareVersion, LinkMode} from './linkExchange/common';
import {StatusEmitterAbstract} from './linkExchange/statusEmitter/statusEmitter.abstract';
import {LinkDeviceService} from '../services/linkdevice.service';
import {catchError, filter, firstValueFrom, map, of, take, timeout} from 'rxjs';


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

  private static enableLinkMode(statusEmitter: StatusEmitterAbstract, mode: LinkMode = LinkMode.onlineLink, variant?: number): Promise<void> {
    let args: Uint8Array = new Uint8Array(variant === undefined ? 1 : 2);
    args[0] = mode;
    if (variant !== undefined) {
      args[1] = variant;
    }
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

  static async tryEnableLinkMode(statusEmitter: StatusEmitterAbstract, mode: LinkMode = LinkMode.onlineLink, variant?: number) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitForReady = this.createReadyPromise(statusEmitter);

    await this.sendCancel(statusEmitter);
    await delay(500);
    await this.enableLinkMode(statusEmitter, mode, variant);
    await waitForReady;
  }

  // Query the firmware version (GetFirmwareInfo, 0x0F). The reply arrives on
  // the data channel, so subscribe before sending. Resolves undefined on
  // timeout — firmware too old to answer, or no device.
  static async getFirmwareVersion(linkDevice: LinkDeviceService, timeoutMs: number = 1500): Promise<FirmwareVersion | undefined> {
    const responsePromise = firstValueFrom(
      linkDevice.dataRawEvents$.pipe(
        filter(bytes =>
          bytes.length >= 4 &&
          bytes[0] === CommandType.GetFirmwareInfo
        ),
        map(bytes => ({
          major: bytes[1],
          minor: bytes[2],
          patch: bytes[3],
        })),
        take(1),
        timeout(timeoutMs),
        catchError(() => of(undefined))
      )
    );

    const sent = await linkDevice.sendCommand(CommandType.GetFirmwareInfo);
    return sent ? responsePromise : undefined;
  }
}


