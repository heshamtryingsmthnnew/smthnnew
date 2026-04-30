require('dotenv').config();
const { queryWolfram } = require('./wolfram');

// These simulate exactly what index.js builds as casExpression for each problem type.
// Problem 1 (quadratic): isEquationType=true → cleanQuestion + ", " + cleanAnswer
// Problems 2&3 (differentiate/integrate): isEquationType=false → final_answer_latex directly

const tests = [
  {
    label: 'Quadratic: x^2 - 5x + 6 = 0',
    // casExpression built by index.js lines 1789-1793:
    //   cleanQuestion = normalizeQuestionForModel(question) = "x^2 - 5x + 6 = 0"
    //   cleanAnswer = final_answer_latex after stripping \text and \quad
    //   Typical model answer: "x = 2, \\ x = 3"  → cleaned → "x = 2,  x = 3"
    casExpression: 'x^2 - 5x + 6 = 0, x = 2, x = 3',
  },
  {
    label: 'Differentiation: differentiate x^3 * ln(x)',
    // isEquationType=false → casExpression = final_answer_latex
    // Typical model answer for d/dx[x^3 ln(x)] = 3x^2 ln(x) + x^2
    casExpression: '3x^2\\ln(x) + x^2',
  },
  {
    label: 'Integration: integrate x^2 * sin(x) dx',
    // isEquationType=false → casExpression = final_answer_latex
    // Typical model answer: -x^2\cos(x) + 2x\sin(x) + 2\cos(x) + C
    casExpression: '-x^2\\cos(x) + 2x\\sin(x) + 2\\cos(x) + C',
  },
];

(async () => {
  for (const t of tests) {
    console.log('\n' + '='.repeat(60));
    console.log('TEST:', t.label);
    console.log('casExpression (what index.js sends):', t.casExpression);
    const result = await queryWolfram(t.casExpression);
    console.log('[CAS] Wolfram result:', result.result);
    console.log('[CAS] success:', result.success);
    if (!result.success) {
      console.log('[CAS] raw pods:', JSON.stringify(result.raw?.queryresult?.pods?.map(p => ({ id: p.id, title: p.title })), null, 2));
    }
  }
  console.log('\n' + '='.repeat(60));
  console.log('Done.');
})();
