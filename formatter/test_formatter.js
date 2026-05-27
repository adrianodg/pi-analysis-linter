const assert = require('assert');
const { formatPiAfAnalysisExpression } = require('./formatter');

const tests = [
    {
        name: 'Simple IF (short) -> KEEP INLINE',
        input: "if B1Comb = 1 then TagMax('Pair1|CombAirFlowCV_dg', '*-40s', '*-6s') else NoOutput()",
        expected: "if B1Comb = 1 then TagMax('Pair1|CombAirFlowCV_dg', '*-40s', '*-6s') else NoOutput()",
        options: { maxLineLength: 100 }
    },
    {
        name: 'Nested IF (short) -> MULTILINE',
        input: "if out1Aux > 100 then 100 else if out1Aux < 0 then 0 else out1Aux",
        expected: "if out1Aux > 100\nthen 100\nelse if out1Aux < 0\nthen 0\nelse out1Aux",
        options: { maxLineLength: 100 }
    },
    {
        name: 'Simple IF (long) -> BREAK CONDITION',
        input: "if A=1 and 'Burner1|CombAirCycleValve_dg'<>'Open' and PrevVal('Burner1|CombAirCycleValve_dg','*')='Open' and TimeEq('Burner1|CombAirCycleValve_dg','*-30s','*','Open')>20 then 1 else 0",
        expected: "if A = 1\nand 'Burner1|CombAirCycleValve_dg' <> \"Open\"\nand PrevVal('Burner1|CombAirCycleValve_dg', '*') = \"Open\"\nand TimeEq('Burner1|CombAirCycleValve_dg', '*-30s', '*', \"Open\") > 20\nthen 1\nelse 0",
        options: { maxLineLength: 100 }
    },
    {
        name: 'Nested IF (long) -> MULTILINE + SPLIT CONDITION',
        input: "if out1Aux > 100 then 100 else if A=1 and 'Burner1|CombAirCycleValve_dg'<>'Open' and PrevVal('Burner1|CombAirCycleValve_dg','*')='Open' and TimeEq('Burner1|CombAirCycleValve_dg','*-30s','*','Open')>20 then 1 else 0",
        expected: "if out1Aux > 100\nthen 100\nelse if A = 1\nand 'Burner1|CombAirCycleValve_dg' <> \"Open\"\nand PrevVal('Burner1|CombAirCycleValve_dg', '*') = \"Open\"\nand TimeEq('Burner1|CombAirCycleValve_dg', '*-30s', '*', \"Open\") > 20\nthen 1\nelse 0",
        options: { maxLineLength: 100 }
    }
];

let failed = false;
console.log('Running PI AF Formatter Tests...\n');

tests.forEach((test, index) => {
    try {
        const result = formatPiAfAnalysisExpression(test.input, test.options);
        assert.strictEqual(result, test.expected);
        console.log(`[PASS] Test ${index + 1}: ${test.name}`);
    } catch (err) {
        failed = true;
        console.log(`[FAIL] Test ${index + 1}: ${test.name}`);
        console.log(`Expected:\n${test.expected}\n`);
        console.log(`Actual:\n${err.actual || err.message}\n`);
    }
});

if (failed) {
    process.exit(1);
} else {
    console.log('\nAll tests completed successfully!');
}

try {
    const input = 'Abs(a)+ b';
    const expected = 'Abs(a) + b';
    const result = formatPiAfAnalysisExpression(input);
    assert.strictEqual(result, expected);
    console.log(`[PASS] Case 'Abs(a)+ b' formatted successfully: '${result}'`);
} catch (err) {
    console.log(`[FAIL] Spacing check for 'Abs(a)+ b': Expected '${err.expected}', got '${err.actual}'`);
}