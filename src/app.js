/**
 * Page wiring. Mounts each interactive piece into its slot and nothing else —
 * the components own their own state and rendering.
 */

import {
  createRosterBoard,
  createMatrixInspector,
  createCapacityLab,
  createAgeProfile,
  createQuiz,
} from './ui.js';
import { createDemonstrationLab } from './demonstrations.js';

const mount = (id, factory) => {
  const node = document.getElementById(id);
  if (node) factory(node);
};

// Hero: Hebbian alone on a 16-d state holding the whole roster. This is the
// configuration that makes mistakes without needing anyone to touch a control.
mount('hero-board', (node) =>
  createRosterBoard(node, { d: 16, count: 20, seed: 11, rules: ['hebbian'], controls: true }),
);

mount('matrix-inspector', (node) => createMatrixInspector(node, { d: 16, n: 12, seed: 4 }));

mount('capacity-lab', (node) => createCapacityLab(node, { d: 32, nMax: 160 }));

mount('age-profile', (node) => createAgeProfile(node, { d: 32, n: 128, lambda: 0.9 }));

mount('compare-board', (node) =>
  createRosterBoard(node, {
    d: 14,
    count: 20,
    seed: 11,
    rules: ['hebbian', 'delta', 'decay'],
    controls: true,
  }),
);

mount('demonstration-lab', (node) => createDemonstrationLab(node, { d: 32, demos: 4, sigma: 0.5 }));

mount('quiz', (node) =>
  createQuiz(node, [
    {
      question:
        'You double d while keeping the number of stored associations fixed. What happens to recall?',
      options: ['It improves', 'It gets worse', 'It does not move'],
      answer: 0,
      explain:
        'Crosstalk scales like (n−1)/d, so doubling the dimensions roughly halves the noise a query has to see past. Try it on the "matrix size d" slider in the capacity lab.',
    },
    {
      question: 'Which memory grows as you store more associations?',
      options: ['The KV cache', 'The fixed-size state', 'Both, at the same rate'],
      answer: 0,
      explain:
        'The cache keeps every key and value it was given, so it grows linearly. The state is d×d floats before the first write and d×d floats after the millionth.',
    },
    {
      question:
        'Averaged over everything ever stored, which write rule recalls best at four times capacity?',
      options: ['Hebbian', 'The delta rule', 'The decay gate'],
      answer: 0,
      explain:
        'This one surprised us too. At n = 4d we measure Hebbian at 0.449 and the delta rule at 0.241. The delta rule subtracts the current read before writing, which erases older associations to keep recent ones sharp. It is not worse, it is allocating the same budget differently — the recall-by-age chart shows exactly where its fidelity went.',
    },
    {
      question:
        'The same rule is written into the state sixteen times, each copy noisy in a different way. Recall of that rule goes up. Why?',
      options: [
        'The signal is identical each time so it adds up, while the noise differs each time so it partly cancels',
        'The state grew to make room for the extra copies',
        'Later writes overwrite the earlier ones',
      ],
      answer: 0,
      explain:
        'This is the BDH-CQ side of the same mechanism. Sixteen noisy demonstrations take recall from 0.232 to 0.804 without the state changing size at all. It is also why consistent evidence is cheap for this memory and unrelated facts are expensive: ten writes of one association cost about what one costs.',
    },
    {
      question:
        "BDH's synaptic update σ(i,j) += Y(i)X(j) runs when?",
      options: [
        'During inference, as the model reads',
        'Only during training, as a gradient step',
        'Once at initialisation',
      ],
      answer: 0,
      explain:
        'It is working memory, not learning. The synapse strengths change while the model processes a sequence and that is what carries context, which is precisely why the capacity question on this page matters for BDH.',
    },
  ]),
);
