import {Pipe} from '@angular/core';


@Pipe({
  name: 'hasReachedState',
  standalone: true,
})
export class ReachedPipe {
  transform<T>(
    current: T,
    step: T
  ): boolean {
    return current >= step;
  }
}

@Pipe({
  name: 'isCurrentlyInState',
  standalone: true,
})
export class CurrentPipe {
  transform<T>(
    current: T,
    step: T
  ): boolean {
    return current == step;
  }
}
