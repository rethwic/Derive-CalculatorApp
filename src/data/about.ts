import type { FormulaAbout } from '../types';

// Plain-language notes for each formula card, kept apart from the formulas
// themselves: what it's for, the clue in a problem that points to it, and the
// traps. A formula with no entry here simply shows no "About" section.
export const formulaAbout: Record<string, FormulaAbout> = {
  // ---------- ALGEBRA & PRECALCULUS ----------
  'alg-quadratic': {
    purpose: 'Finds where a parabola crosses the x-axis: the solutions of ax² + bx + c = 0.',
    when: [
      'The equation is a quadratic and won’t factor cleanly.',
      'You need exact roots, including irrational or complex ones.',
      'A problem asks when a thrown object lands, or where a curve hits zero.',
    ],
    watch: [
      'Move everything to one side first, so the equation equals 0.',
      'The discriminant b² − 4ac tells you the count: positive gives two real roots, zero gives one, negative gives none (two complex).',
      'a cannot be 0, or it isn’t a quadratic.',
    ],
    notThis: 'If it factors easily, factoring is faster. For the vertex, use x = −b / 2a instead.',
    example: 'x² − 5x + 6 = 0 has a = 1, b = −5, c = 6, so x = (5 ± 1) / 2, giving x = 3 or x = 2.',
  },
  'alg-slope': {
    purpose: 'Measures how steep a line is: the rise divided by the run between two points.',
    when: [
      'You’re given two points and need the line’s steepness.',
      'A problem asks for a rate of change from a table or graph.',
      'You need the slope before writing the equation of the line.',
    ],
    watch: [
      'Subtract in the same order on top and bottom: (y₂ − y₁) with (x₂ − x₁).',
      'A vertical line has x₂ = x₁, so the slope is undefined, not zero.',
      'A horizontal line has slope 0.',
    ],
    notThis: 'Once you have the slope and a point, use Point-Slope Form to write the line.',
    example: 'Through (1, 2) and (3, 8): m = (8 − 2) / (3 − 1) = 3.',
  },
  'alg-point-slope': {
    purpose: 'Writes the equation of a line when you know its slope and one point on it.',
    when: [
      'You’re given a slope and a point.',
      'You’ve just found a slope from two points and need the line’s equation.',
      'You want a quick start before rearranging to y = mx + b.',
    ],
    watch: [
      'Signs matter: for the point (3, −2), write y − (−2), which is y + 2.',
      'The point (x₁, y₁) is a known point, while x and y stay as variables.',
      'The result isn’t in y = mx + b form until you solve for y.',
    ],
    notThis: 'If you have two points, find the slope first with the Slope Formula.',
    example: 'Slope 2 through (1, 3): y − 3 = 2(x − 1), which simplifies to y = 2x + 1.',
  },
  'alg-exp-growth': {
    purpose: 'Models something that grows or shrinks by a constant percentage every moment, continuously.',
    when: [
      'Population growth, bacteria, or continuous compounding.',
      'Radioactive decay or cooling described with a rate k.',
      'The problem says “continuously” or gives you e.',
    ],
    watch: [
      'k > 0 means growth and k < 0 means decay.',
      'k and t need matching time units (per year with years, per hour with hours).',
      'k is a continuous rate, not the same as a yearly percentage.',
    ],
    notThis: 'For interest paid in set periods (monthly, yearly), use Compound Interest.',
    example: '100 units at k = 0.05 for 10 years: A = 100·e^(0.5) ≈ 164.9.',
  },
  'alg-compound-interest': {
    purpose: 'Finds what money grows to when interest is added at regular intervals and earns interest itself.',
    when: [
      'Savings, loans or investments with interest added monthly, quarterly or yearly.',
      'You need the final amount after a number of years.',
      'A problem gives a rate, a principal and how often it compounds.',
    ],
    watch: [
      'Write the rate r as a decimal: 5% is 0.05.',
      'n is how many times per year it compounds (12 for monthly, 4 for quarterly).',
      't must be in years.',
      'The answer A includes the principal; the interest alone is A − P.',
    ],
    notThis: 'If it compounds continuously, use A = P·e^(rt) from the exponential growth formula.',
    example: '$1,000 at 5% compounded monthly for 10 years: 1000(1 + 0.05/12)^120 ≈ $1,647.01.',
  },
  'alg-log-change-base': {
    purpose: 'Rewrites a logarithm in any base using logs your calculator has.',
    when: [
      'You need log base 3 or base 7 of something and only have log and ln buttons.',
      'You want to compare logarithms in different bases.',
      'A problem needs one shared base to simplify.',
    ],
    watch: [
      'Use the same kind of log on top and bottom: both ln or both log.',
      'The new base is your choice; the answer doesn’t change.',
      'The base b must be positive and not 1, and x must be positive.',
    ],
    example: 'log₂ 20 = ln 20 / ln 2 ≈ 4.32.',
  },
  'alg-distance': {
    purpose: 'Finds the straight-line distance between two points on a plane.',
    when: [
      'You’re given the coordinates of two points and need the length between them.',
      'A problem asks for the length of a segment, or the sides of a shape on a grid.',
      'Checking whether a point lies on a circle of a given radius.',
    ],
    watch: [
      'Squaring removes the sign, so the order of the points doesn’t matter.',
      'Don’t forget the square root at the end.',
      'It’s the Pythagorean Theorem in disguise, using the horizontal and vertical gaps as legs.',
    ],
    notThis: 'For the point halfway between them, use the Midpoint Formula.',
    example: 'From (1, 2) to (4, 6): d = √(3² + 4²) = 5.',
  },
  'alg-arithmetic-sequence': {
    purpose: 'Finds any term in a sequence that goes up or down by the same amount each step.',
    when: [
      'Each term differs from the last by a constant (2, 5, 8, 11, …).',
      'You need the 50th term without listing 49 first.',
      'A pattern problem adds the same amount each time.',
    ],
    watch: [
      'It’s (n − 1) times d, not n times d, because the first term hasn’t moved yet.',
      'd is negative if the sequence decreases.',
      'Check the sequence really has a common difference before using it.',
    ],
    notThis: 'If terms are multiplied by a constant ratio instead, use the Geometric Sequence formula.',
    example: '2, 5, 8, … has a₁ = 2 and d = 3, so a₁₀ = 2 + 9·3 = 29.',
  },
  'alg-arithmetic-series': {
    purpose: 'Adds up the first n terms of an arithmetic sequence without writing them all out.',
    when: [
      'You need the total of terms that rise by a constant amount (1 + 2 + … + 100).',
      'A problem stacks rows or seats that grow by the same amount each row.',
      'You know the first and last terms and how many there are.',
    ],
    watch: [
      'It needs the last term aₙ; find it with the nth-term formula first if you only know d.',
      'n is the number of terms, not the value of the last one.',
      'It only works for a constant difference.',
    ],
    notThis: 'For a constant ratio between terms, use the Geometric Series Sum.',
    example: '1 + 2 + … + 100: S = 100/2 · (1 + 100) = 5,050.',
  },
  'alg-geometric-sequence': {
    purpose: 'Finds any term in a sequence where each term is the previous one times a fixed ratio.',
    when: [
      'Terms double, triple or halve each step (3, 6, 12, 24, …).',
      'Repeated percentage change, such as a ball bouncing to 60% of its last height.',
      'You need a far-off term without listing every one.',
    ],
    watch: [
      'The exponent is n − 1, not n.',
      'r is the ratio between consecutive terms, so divide a term by the one before it to find it.',
      'A negative r makes the signs alternate.',
    ],
    notThis: 'If terms change by adding a constant, use the Arithmetic Sequence formula.',
    example: '3, 6, 12, … has a₁ = 3 and r = 2, so a₆ = 3·2⁵ = 96.',
  },
  'alg-geometric-series': {
    purpose: 'Adds up the first n terms of a geometric sequence in one step.',
    when: [
      'You need the total of terms that keep multiplying by the same ratio.',
      'Savings plans, drug doses or repeated bounces added together.',
      'A pattern problem asks for a sum of doubling or shrinking amounts.',
    ],
    watch: [
      'r cannot be 1; if it is, every term is equal, so the sum is just n·a₁.',
      'It’s for a finite number of terms n.',
      'For an infinite sum with |r| < 1, the total is a₁ / (1 − r) instead.',
    ],
    notThis: 'For a constant difference between terms, use the Arithmetic Series Sum.',
    example: '1 + 2 + 4 + 8 + 16: S = 1·(1 − 2⁵) / (1 − 2) = 31.',
  },
  'alg-midpoint': {
    purpose: 'Finds the point exactly halfway between two points.',
    when: [
      'You need the centre of a line segment.',
      'A problem gives two endpoints of a diameter and asks for the circle’s centre.',
      'Finding the balance point of two coordinates.',
    ],
    watch: [
      'It’s just the average of the x’s and the average of the y’s.',
      'The answer is a point, so give both coordinates.',
      'To go the other way (find an endpoint from a midpoint), rearrange: x₂ = 2·xₘ − x₁.',
    ],
    notThis: 'For the length of the segment, use the Distance Formula.',
    example: 'Between (2, 4) and (8, 10): M = (5, 7).',
  },
};
