// schedule.js -- Taught schedule (teacher creates one per class)
// Format: flat enabledProblemTypes list. Teacher ticks what they've taught.
// ENCODING: This file MUST be pure ASCII. All non-ASCII chars are \uXXXX escaped.

const TAUGHT_SCHEDULE = {
  "className": "12 Methods Per 2 \u2014 2026",
  "teacherName": "Mr Smith",
  "markEndpoint": "https://australia-southeast1-wace-trainer.cloudfunctions.net/mark",
  "sympyEndpoint": "https://australia-southeast1-wace-trainer.cloudfunctions.net/verify",
  "enabledProblemTypes": [
    "Chain rule differentiation",
    "Product rule differentiation",
    "Quotient rule differentiation",
    "Differentiation problem",
    "Differentiating polynomial composite function using chain rule",
    "Differentiating square root of linear function",
    "Differentiating $x^n \\cdot e^{f(x)}$ using product rule",
    "Differentiating $x^n \\cdot \\ln(f(x))$ using product rule",
    "Differentiating $x \\cdot e^{x^2}$ using product rule with chain rule",
    "Differentiating a trigonometric quotient using quotient rule",
    "Differentiating polynomial rational function using quotient rule",
    "Differentiating composite function with square root and trigonometric function",
    "Differentiating product of polynomial and trigonometric function using product rule",
    "Differentiating product of exponential and trigonometric function using product rule",
    "Differentiating exponential rational function using quotient rule to find maximum",
    "Differentiating exponential/trigonometric quotient using quotient rule and evaluating",
    "Finding rate of change by differentiation",
    "Reading derivative from graph at a point",
    "Evaluating derivative of composition using chain rule with graph values",
    "Evaluating derivative of product using product rule with graph values",
    "Evaluating derivative of quotient using quotient rule with table values",
    "Showing derivative of composite function using chain rule and prior result (hence show that)",
    "Showing derivative of quotient with exponential denominator using quotient rule",
    "Proving trigonometric derivative identity using quotient rule (show that)"
  ]
};
