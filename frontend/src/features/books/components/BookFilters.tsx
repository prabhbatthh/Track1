import { useTranslation } from 'react-i18next';

import { SearchBar, Select } from '@/components/ui';

import type { BookSort } from '../hooks/useBooks';

// ponytail: a flat, hardcoded list — no Category table yet, add one if categories
// need to be manager-editable instead of a fixed set.
const bookCategories = [
  'All',
  'Fiction',
  'Non-Fiction',
  'Science',
  'Technology',
  'Biography',
  'Self-Help',
] as const;

// Translation key for each non-"All" category — see books.categories in en.json.
const CATEGORY_KEYS: Partial<Record<(typeof bookCategories)[number], string>> = {
  Fiction: 'fiction',
  'Non-Fiction': 'nonFiction',
  Science: 'science',
  Technology: 'technology',
  Biography: 'biography',
  'Self-Help': 'selfHelp',
};

const bookSorts: BookSort[] = ['newest', 'rating', 'recommended'];

export interface BookFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  sort: BookSort;
  onSortChange: (value: BookSort) => void;
}

export function BookFilters({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
}: BookFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchBar
        value={search}
        onChange={onSearchChange}
        placeholder={t('books.filters.searchPlaceholder')}
        label={t('books.filters.searchAriaLabel')}
        aria-label={t('books.filters.searchAriaLabel')}
        className="sm:max-w-sm"
      />
      <Select
        value={category}
        onChange={(event) => onCategoryChange(event.target.value)}
        aria-label={t('books.filters.categoryAriaLabel')}
        className="sm:w-48"
        options={bookCategories.map((value) => ({
          value,
          label:
            value === 'All' ? t('books.filters.allCategories') : t(`books.categories.${CATEGORY_KEYS[value]}`, value),
        }))}
      />
      <Select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as BookSort)}
        aria-label={t('books.filters.sortAriaLabel')}
        className="sm:w-56"
        options={bookSorts.map((value) => ({
          value,
          label: t(`books.filters.sortOptions.${value}`),
        }))}
      />
    </div>
  );
}
