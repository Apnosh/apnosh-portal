'use client';

import { Label, TextArea, Select } from './ui';

const MARKETING_GOALS = [
  'Get more customers',
  'Build brand awareness',
  'Grow social media',
  'Increase website traffic',
  'Get more reviews',
  'Launch new product/service',
  'Improve local SEO',
  'Start email marketing',
];

const BUDGETS = [
  '$0 - $200',
  '$200 - $500',
  '$500 - $1,000',
  '$1,000 - $2,000',
  '$2,000+',
];

interface Props {
  data: {
    marketingGoals: string[];
    targetAudience: string;
    monthlyBudget: string;
  };
  onChange: (field: string, value: string | string[]) => void;
}

export default function StepGoalsAudience({ data, onChange }: Props) {
  function toggleGoal(goal: string) {
    const current = data.marketingGoals;
    if (current.includes(goal)) {
      onChange('marketingGoals', current.filter((g) => g !== goal));
    } else {
      onChange('marketingGoals', [...current, goal]);
    }
  }

  return (
    <div className="space-y-5">
      {/* Marketing goals */}
      <div>
        <Label>What are your marketing goals?</Label>
        <p className="text-xs text-gray-400 mb-3">Select all that apply.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MARKETING_GOALS.map((goal) => {
            const checked = data.marketingGoals.includes(goal);
            return (
              <label
                key={goal}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-all ${
                  checked
                    ? 'border-[#4abd98] bg-[#eaf7f3] text-[#1d1d1f]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleGoal(goal)}
                  className="accent-[#4abd98] w-4 h-4"
                />
                {goal}
              </label>
            );
          })}
        </div>
      </div>

      {/* Target audience */}
      <div>
        <Label htmlFor="targetAudience">Describe your ideal customer</Label>
        <TextArea
          id="targetAudience"
          value={data.targetAudience}
          onChange={(v) => onChange('targetAudience', v)}
          placeholder="e.g. Busy parents aged 30-45 in suburban areas who want healthy, quick meal options."
          rows={3}
        />
      </div>

      {/* Budget */}
      <div>
        <Label htmlFor="monthlyBudget">Monthly marketing budget</Label>
        <Select
          id="monthlyBudget"
          value={data.monthlyBudget}
          onChange={(v) => onChange('monthlyBudget', v)}
          options={BUDGETS}
          placeholder="Select a range"
        />
      </div>
    </div>
  );
}
