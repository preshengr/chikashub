import '../styles/base.css';
import '../styles/register.css';
import { api, ApiError } from '../core/api';
import { qs, qsa, todayISODate } from '../core/dom';
import { createModal, type ModalController } from '../core/modal';
import { saveSession } from '../core/session';
import { showToast } from '../core/toast';
import type { AuthResult, RegisterResult } from '../core/types';
import {
  validateRegistration,
  type FieldErrors,
  type RegistrationFormValues,
} from '../core/validate';

interface FieldMap {
  control: string;
  error: string;
}

/** Server validation field -> form control + inline error element ids. */
const FIELDS: Record<string, FieldMap> = {
  'parent.firstName': { control: 'parentFirstName', error: 'err-parentFirstName' },
  'parent.lastName': { control: 'parentLastName', error: 'err-parentLastName' },
  'parent.relationship': { control: 'relationship', error: 'err-relationship' },
  'parent.email': { control: 'parentEmail', error: 'err-parentEmail' },
  'parent.phone': { control: 'parentPhone', error: 'err-parentPhone' },
  'child.firstName': { control: 'childFirstName', error: 'err-childFirstName' },
  'child.age': { control: 'childAge', error: 'err-childAge' },
  'child.grade': { control: 'childGrade', error: 'err-childGrade' },
  'preferences.learningGoals': { control: '', error: 'err-preferencesLearningGoals' },
  'preferences.readingLevel': { control: 'readingLevel', error: 'err-preferencesReadingLevel' },
  'preferences.gameplayStyle': { control: '', error: 'err-preferencesGameplayStyle' },
  'consent.consentData': { control: 'consentData', error: 'err-consentConsentData' },
  'consent.termsConsent': { control: 'termsConsent', error: 'err-consentTermsConsent' },
  'consent.signatureFullName': { control: 'signature', error: 'err-consentSignatureFullName' },
  'consent.signatureDate': { control: 'signatureDate', error: 'err-consentSignatureDate' },
};

const PANEL_FIELDS: Record<number, string[]> = {
  1: ['parent.firstName', 'parent.lastName', 'parent.relationship', 'parent.email', 'parent.phone'],
  2: ['child.firstName', 'child.age', 'child.grade'],
  3: [
    'preferences.learningGoals',
    'preferences.readingLevel',
    'preferences.gameplayStyle',
  ],
  4: [
    'consent.consentData',
    'consent.termsConsent',
    'consent.signatureFullName',
    'consent.signatureDate',
  ],
};

let currentStep = 1;
let stagedUsername: string | null = null;

function collectValues(): RegistrationFormValues {
  const form = qs<HTMLFormElement>('#register-form');
  const data = new FormData(form);
  const goals = data.getAll('learningGoals').map(String);
  return {
    parentFirstName: String(data.get('parentFirstName') ?? '').trim(),
    parentLastName: String(data.get('parentLastName') ?? '').trim(),
    relationship: String(data.get('relationship') ?? ''),
    parentEmail: String(data.get('parentEmail') ?? '').trim(),
    parentPhone: String(data.get('parentPhone') ?? '').trim(),
    childFirstName: String(data.get('childFirstName') ?? '').trim(),
    childAge: String(data.get('childAge') ?? ''),
    childGrade: String(data.get('childGrade') ?? ''),
    learningGoals: goals,
    readingLevel: String(data.get('readingLevel') ?? ''),
    gameplayStyle: String(data.get('gameplayStyle') ?? ''),
    consentData: data.get('consentData') === 'on',
    termsConsent: data.get('termsConsent') === 'on',
    signature: String(data.get('signature') ?? '').trim(),
    signatureDate: String(data.get('signatureDate') ?? ''),
  };
}

function findControl(target: string): HTMLElement | null {
  if (!target) return null;
  return document.getElementById(target);
}

function displayErrors(errors: FieldErrors, only?: string[]): void {
  const visible = new Set(only);
  for (const [field, message] of Object.entries(errors)) {
    if (visible.size && !visible.has(field)) continue;
    const map = FIELDS[field];
    if (!map) continue;
    const errorNode = document.getElementById(map.error);
    if (errorNode) errorNode.textContent = message;
    const control = findControl(map.control);
    control?.setAttribute('aria-invalid', 'true');
  }
}

function clearErrors(fields?: string[]): void {
  const keys = fields ?? Object.keys(FIELDS);
  for (const field of keys) {
    const map = FIELDS[field];
    if (!map) continue;
    const errorNode = document.getElementById(map.error);
    if (errorNode) errorNode.textContent = '';
    findControl(map.control)?.removeAttribute('aria-invalid');
  }
}

function showSummary(errors: FieldErrors): void {
  const summary = qs('#form-summary');
  const count = Object.keys(errors).length;
  if (!count) {
    summary.classList.remove('is-visible');
    summary.textContent = '';
    return;
  }
  summary.textContent = `Please fix ${count === 1 ? 'one problem' : `${count} problems`} highlighted below.`;
  summary.classList.add('is-visible');
}

function validateStep(step: number): FieldErrors {
  const all = validateRegistration(collectValues());
  const allowed = PANEL_FIELDS[step] ?? [];
  const scoped: FieldErrors = {};
  for (const field of allowed) {
    if (all[field]) scoped[field] = all[field];
  }
  clearErrors(PANEL_FIELDS[step]);
  if (Object.keys(scoped).length) {
    displayErrors(scoped);
    showSummary(scoped);
    focusFirstError(scoped);
  } else {
    showSummary({});
  }
  return scoped;
}

function focusFirstError(errors: FieldErrors): void {
  const first = Object.keys(errors)[0];
  if (!first) return;
  const control = findControl(FIELDS[first]?.control ?? '');
  control?.focus();
}

function setStep(step: number): void {
  currentStep = step;
  qsa<HTMLElement>('.step-panel').forEach((panel) => {
    const active = Number(panel.dataset.panel) === step;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
    panel.classList.toggle('is-entering', active);
  });
  qsa<HTMLElement>('.steps__item').forEach((item) => {
    const index = Number(item.dataset.step);
    item.classList.toggle('is-active', index === step);
    item.classList.toggle('is-complete', index < step);
  });
  const legend = document.querySelector<HTMLElement>(`.step-panel[data-panel="${step}"] legend`);
  legend?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function initSteps(): void {
  qsa<HTMLButtonElement>('[data-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const errors = validateStep(currentStep);
      if (Object.keys(errors).length) return;
      setStep(Number(button.dataset.next));
    });
  });
  qsa<HTMLButtonElement>('[data-back]').forEach((button) => {
    button.addEventListener('click', () => setStep(Number(button.dataset.back)));
  });
}

function initLiveValidation(): void {
  const form = qs<HTMLFormElement>('#register-form');
  form.addEventListener(
    'blur',
    (event) => {
      const control = event.target as HTMLElement;
      if (!control.id || control.tagName === 'BUTTON') return;
      const field = Object.entries(FIELDS).find(([, map]) => map.control === control.id)?.[0];
      if (!field) return;
      const errors = validateRegistration(collectValues());
      const errorNode = document.getElementById(`err-${control.id}`);
      if (errorNode) errorNode.textContent = errors[field] ?? '';
      if (errors[field]) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    },
    true,
  );

  // A child picks at most two learning goals.
  const goalInputs = qsa<HTMLInputElement>('input[name="learningGoals"]');
  goalInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const checked = goalInputs.filter((candidate) => candidate.checked);
      if (checked.length > 2) {
        input.checked = false;
        showToast('Two learning goals is the maximum — pick your favourites!', 'info');
      }
      const errorNode = document.getElementById('err-preferencesLearningGoals');
      if (checked.length >= 1 && errorNode) errorNode.textContent = '';
    });
  });
}

async function submitRegistration(payload: RegistrationFormValues): Promise<void> {
  const submit = qs<HTMLButtonElement>('#submit-btn');
  submit.classList.add('is-loading');
  submit.disabled = true;
  const spinner = document.createElement('span');
  spinner.className = 'btn__spinner';
  submit.prepend(spinner);

  try {
    const result = await api.post<RegisterResult>('/auth/register', {
      parent: {
        firstName: payload.parentFirstName,
        lastName: payload.parentLastName,
        relationship: payload.relationship,
        email: payload.parentEmail,
        ...(payload.parentPhone ? { phone: payload.parentPhone } : {}),
      },
      child: {
        firstName: payload.childFirstName,
        age: Number(payload.childAge),
        grade: payload.childGrade,
      },
      preferences: {
        learningGoals: payload.learningGoals,
        readingLevel: payload.readingLevel,
        gameplayStyle: payload.gameplayStyle,
      },
      consent: {
        consentData: payload.consentData,
        termsConsent: payload.termsConsent,
        signatureFullName: payload.signature,
        signatureDate: payload.signatureDate,
      },
    });
    openUsernameModal(result);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.details?.length) {
        const errors: FieldErrors = {};
        for (const detail of error.details) errors[detail.field] = detail.message;
        clearErrors();
        displayErrors(errors);
        showSummary(errors);
        const firstTarget = FIELDS[error.details[0].field]?.control ?? '';
        const control = findControl(firstTarget ?? '');
        // Jump the grown-up to the step that actually has the problem.
        const stepWithIssue = Object.entries(PANEL_FIELDS).find(([, fields]) =>
          error.details?.some((detail) => fields.includes(detail.field)),
        );
        if (stepWithIssue) setStep(Number(stepWithIssue[0]));
        control?.focus();
      } else {
        showToast(error.message, 'error');
      }
    } else {
      showToast('Something unexpected happened. Please try again.', 'error');
    }
  } finally {
    spinner.remove();
    submit.classList.remove('is-loading');
    submit.disabled = false;
  }
}

function openUsernameModal(result: RegisterResult): void {
  stagedUsername = result.username;
  qs('#generated-username').textContent = result.username;
  qs('#username-expiry').textContent = `This offer expires in ${result.expiresInMinutes} minutes.`;
  usernameModal.open();
}

function initUsernameModal(): ModalController {
  const overlay = qs('#username-modal');
  const usernameModal = createModal(overlay, { closeOnBackdrop: false, closeOnEscape: false });

  qs('#accept-username').addEventListener('click', async () => {
    if (!stagedUsername) return;
    const button = qs<HTMLButtonElement>('#accept-username');
    button.disabled = true;
    try {
      const result = await api.post<AuthResult>('/auth/register/confirm', {
        username: stagedUsername,
        accept: true,
      });
      if ('denied' in result) {
        showToast('That registration was cancelled earlier. Please register again.', 'error');
        usernameModal.close();
        return;
      }
      saveSession({
        username: result.username,
        token: result.token,
        expiresAt: result.expiresAt,
        profile: result.profile,
      });
      usernameModal.close();
      showToast(`Welcome, ${result.profile.child.firstName}!`, 'success');
      window.location.assign('dashboard.html');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not accept the username. Try again.';
      showToast(message, 'error');
      button.disabled = false;
    }
  });

  qs('#deny-username').addEventListener('click', async () => {
    if (!stagedUsername) return;
    const button = qs<HTMLButtonElement>('#deny-username');
    button.disabled = true;
    try {
      await api.post('/auth/register/deny', { username: stagedUsername });
      showToast('Registration cancelled — your form is ready if you change your mind.', 'success');
    } catch (error) {
      if (!(error instanceof ApiError) || !error.isAuthError) {
        showToast('We could not cancel just now — please try again.', 'error');
      }
    } finally {
      button.disabled = false;
      stagedUsername = null;
      usernameModal.close();
      setStep(1);
    }
  });

  return usernameModal;
}

let usernameModal: ReturnType<typeof createModal>;

function runIntro(force = false): void {
  const intro = qs('#intro');
  const stage = qs('#stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = (): void => {
    intro.classList.add('is-done');
    intro.classList.remove('is-playing', 'is-writing');
    stage.classList.add('is-visible');
    window.setTimeout(() => {
      intro.hidden = true;
    }, 550);
  };

  intro.hidden = false;
  intro.classList.remove('is-done', 'is-playing', 'is-writing');
  stage.classList.remove('is-visible');

  if (reduced && !force) {
    finish();
    return;
  }

  requestAnimationFrame(() => {
    intro.classList.add('is-playing');
    window.setTimeout(() => intro.classList.add('is-writing'), 700);
    window.setTimeout(finish, 3400);
  });
}

function boot(): void {
  qs('#year').textContent = String(new Date().getFullYear());
  qs<HTMLInputElement>('#signatureDate').value = todayISODate();
  usernameModal = initUsernameModal();

  initSteps();
  initLiveValidation();

  qs('#intro-skip').addEventListener('click', () => {
    const intro = qs('#intro');
    intro.classList.add('is-done');
    qs('#stage').classList.add('is-visible');
    window.setTimeout(() => {
      intro.hidden = true;
    }, 350);
  });

  qs('#replay-intro').addEventListener('click', () => {
    const intro = qs('#intro');
    intro.hidden = false;
    runIntro(true);
  });

  qs<HTMLFormElement>('#register-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const all = validateRegistration(collectValues());
    clearErrors();
    if (Object.keys(all).length) {
      displayErrors(all);
      showSummary(all);
      const stepWithIssue = Object.entries(PANEL_FIELDS).find(([, fields]) =>
        fields.some((field) => all[field]),
      );
      if (stepWithIssue) setStep(Number(stepWithIssue[0]));
      focusFirstError(all);
      return;
    }
    void submitRegistration(collectValues());
  });

  runIntro();
}

boot();
