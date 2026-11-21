import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Registrado no `expect` desta instância do Vitest (o atalho do pacote pode resolver outra cópia).
expect.extend(matchers);

afterEach(() => cleanup());

// jsdom ainda não implementa <dialog> modal; reproduzimos o comportamento do atributo `open` usado pelo navegador.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
