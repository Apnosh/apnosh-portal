'use client';

import { useState, type KeyboardEvent } from 'react';
import { Label, TextArea } from './ui';

interface Props {
  data: {
    brandWords: string[];
    brandTone: string;
    primaryColor: string;
    secondaryColor: string;
  };
  onChange: (field: string, value: string | string[]) => void;
  businessId: string | null;
  onLogoUpload: (file: File) => void;
}

export default function StepBrandIdentity({ data, onChange, onLogoUpload }: Props) {
  const [tagInput, setTagInput] = useState('');

  function addTag(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const word = tagInput.trim();
      if (word && data.brandWords.length < 5 && !data.brandWords.includes(word)) {
        onChange('brandWords', [...data.brandWords, word]);
        setTagInput('');
      }
    }
  }

  function removeTag(word: string) {
    onChange('brandWords', data.brandWords.filter((w) => w !== word));
  }

  return (
    <div className="space-y-5">
      {/* Brand voice words */}
      <div>
        <Label>Brand voice words (up to 5)</Label>
        <p className="text-xs text-gray-400 mb-2">Type a word and press Enter to add.</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {data.brandWords.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1 rounded-full bg-[#eaf7f3] px-3 py-1 text-sm font-medium text-[#2e9a78]"
            >
              {word}
              <button
                type="button"
                onClick={() => removeTag(word)}
                className="ml-0.5 text-[#2e9a78]/60 hover:text-[#2e9a78]"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        {data.brandWords.length < 5 && (
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            placeholder="e.g. Bold, Friendly, Modern"
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-[#4abd98] focus:ring-2 focus:ring-[#4abd98]/20 placeholder:text-gray-400"
            style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
          />
        )}
      </div>

      {/* Brand tone */}
      <div>
        <Label htmlFor="brandTone">How should your brand sound?</Label>
        <TextArea
          id="brandTone"
          value={data.brandTone}
          onChange={(v) => onChange('brandTone', v)}
          placeholder="e.g. Professional but approachable, like talking to a trusted friend who happens to be an expert."
          rows={3}
        />
      </div>

      {/* Logo upload */}
      <div>
        <Label htmlFor="logo">Logo</Label>
        <input
          id="logo"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLogoUpload(file);
          }}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#eaf7f3] file:text-[#2e9a78] hover:file:bg-[#d5f0e8] cursor-pointer"
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="primaryColor">Primary color</Label>
          <div className="flex items-center gap-3">
            <input
              id="primaryColor"
              type="color"
              value={data.primaryColor}
              onChange={(e) => onChange('primaryColor', e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 font-mono">{data.primaryColor}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="secondaryColor">Secondary color</Label>
          <div className="flex items-center gap-3">
            <input
              id="secondaryColor"
              type="color"
              value={data.secondaryColor}
              onChange={(e) => onChange('secondaryColor', e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <span className="text-sm text-gray-500 font-mono">{data.secondaryColor}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
