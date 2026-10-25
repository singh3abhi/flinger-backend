import { onboardingProgress, type OnboardingSnapshot } from './onboarding';

const EMPTY: OnboardingSnapshot = {
  displayName: null,
  birthDate: null,
  gender: null,
  heightCm: null,
  attributeCounts: { interested_in: 0, hoping_to_find: 0, values: 0, causes: 0 },
  promptCount: 0,
  photoCount: 0,
  hasLocation: false,
  consentsAccepted: false,
};

const READY: OnboardingSnapshot = {
  displayName: 'Rohan',
  birthDate: '1996-03-14',
  gender: 'man',
  heightCm: 172,
  attributeCounts: { interested_in: 1, hoping_to_find: 2, values: 3, causes: 0 },
  promptCount: 3,
  photoCount: 4,
  hasLocation: true,
  consentsAccepted: true,
};

describe('onboardingProgress', () => {
  it('starts at basics with every step missing', () => {
    const progress = onboardingProgress(EMPTY);
    expect(progress.completed).toBe(false);
    expect(progress.nextStep).toBe('basics');
    expect(progress.missing).toHaveLength(10);
  });

  it('needs both name and birthday for basics', () => {
    expect(onboardingProgress({ ...EMPTY, displayName: 'Rohan' }).nextStep).toBe('basics');
    expect(
      onboardingProgress({ ...EMPTY, displayName: 'Rohan', birthDate: '1996-03-14' }).nextStep,
    ).toBe('gender');
  });

  it('is complete when every required step is done; causes are optional', () => {
    expect(onboardingProgress(READY)).toEqual({ completed: true, nextStep: null, missing: [] });
  });

  it('requires at least 4 photos and exactly the required number of prompts', () => {
    expect(onboardingProgress({ ...READY, photoCount: 3 }).missing).toEqual(['photos']);
    expect(onboardingProgress({ ...READY, promptCount: 2 }).missing).toEqual(['prompts']);
  });

  it('resumes at the first missing step even if later steps are done', () => {
    const progress = onboardingProgress({
      ...READY,
      attributeCounts: { ...READY.attributeCounts, hoping_to_find: 0 },
      hasLocation: false,
    });
    expect(progress.nextStep).toBe('hoping_to_find');
    expect(progress.missing).toEqual(['hoping_to_find', 'location']);
  });
});
