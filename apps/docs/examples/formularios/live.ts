import { Component } from '@angular/core';
import { ReactiveForm } from './reactive-form';
import { TemplateForm } from './template-form';
import { ValueForm } from './value-form';

/** Exemplo vivo: Template Forms e Reactive Forms com as diretivas, e `[(value)]` sem formulário. */
@Component({
  selector: 'docs-formularios-live',
  imports: [TemplateForm, ReactiveForm, ValueForm],
  templateUrl: './live.html',
})
export class FormulariosLive {}
