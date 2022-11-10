import React, { useEffect, useRef, useState } from 'react';
import type { Root as Hast } from 'hast';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CloseIcon from '@mui/icons-material/Close';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import {
    Dispatch,
    searchQuery,
    searchNext,
    searchPrevious,
    closeSearch,
    setSearchMatcher,
    findSearchMatchElems,
} from '../reducer';
import type { SearchMatcher } from '../ipc';
import * as log from '../log';

const PAPER_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '420px',
    margin: '8px',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
};
const COUNTER_STYLE: React.CSSProperties = {
    maxWidth: '200px',
    cursor: 'default',
    color: 'rgba(0,0,0,0.54)',
};
const INPUT_STYLE: React.CSSProperties = {
    flex: 'auto',
    marginLeft: '4px',
    fontFamily: 'inherit',
};
const DIVIDER_STYLE: React.CSSProperties = {
    marginLeft: '0.5rem',
    height: '1.5rem',
};
const MENU_ITEM_STYLE: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '0.8rem',
};
const ALL_MATCHERS: [SearchMatcher, string][] = [
    ['SmartCase', 'smart case'],
    ['CaseSensitive', 'case sensitive'],
    ['CaseInsensitive', 'case insensitive'],
    ['CaseSensitiveRegex', 'regular expression'],
];

function isInViewport(elem: Element): boolean {
    const rect = elem.getBoundingClientRect();
    const height = window.innerHeight ?? document.documentElement.clientHeight;
    const width = window.innerWidth ?? document.documentElement.clientWidth;
    return 0 <= rect.top && 0 <= rect.left && rect.bottom <= height && rect.right <= width;
}

interface Props {
    previewContent: Hast;
    index: number | null;
    matcher: SearchMatcher;
    dispatch: Dispatch;
}

export const Search: React.FC<Props> = ({ previewContent, index, matcher, dispatch }) => {
    const counterElem = useRef<HTMLDivElement>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const current = document.querySelector('.search-text-current');
        if (current && !isInViewport(current)) {
            current.scrollIntoView({
                block: 'center',
                inline: 'center',
            });
        }
        if (counterElem.current !== null) {
            const nth = index !== null ? index + 1 : 0;
            const total = findSearchMatchElems().length;
            counterElem.current.textContent = `${nth} / ${total}`;
        }
    }, [index, previewContent]);

    const handlePrev = (): void => {
        dispatch(searchPrevious(index));
    };
    const handleNext = (): void => {
        dispatch(searchNext(index));
    };
    const handleClose = (): void => {
        dispatch(closeSearch());
    };
    const handleChange = (e: React.FormEvent<HTMLInputElement>): void => {
        // TODO: Consider to debounce this event. Updating highlighted matches require re-rendering the content.
        // And re-rendering the content takes a few seconds on large content.
        searchQuery(previewContent, e.currentTarget.value, index, matcher).then(dispatch).catch(log.error);
    };
    const handleKeydown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleNext();
        } else if (e.key === 'Enter' && e.shiftKey) {
            handlePrev();
        } else if (e.key === 'Escape') {
            handleClose();
        } else {
            return;
        }
        e.preventDefault();
    };
    const handleMenuOpen = (e: React.MouseEvent<HTMLElement>): void => {
        setMenuAnchor(e.currentTarget);
    };
    const handleMenuClose = (): void => {
        setMenuAnchor(null);
    };
    const handleMenuItemClick = (selected: SearchMatcher): void => {
        log.debug('Search matcher selected', selected);
        if (selected !== matcher) {
            dispatch(setSearchMatcher(selected));
        }
        setMenuAnchor(null);
    };

    return (
        <Paper elevation={4} style={PAPER_STYLE}>
            <IconButton
                size="small"
                title="Select search matcher"
                aria-label="select search matcher"
                onClick={handleMenuOpen}
            >
                <ManageSearchIcon />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={handleMenuClose}>
                {ALL_MATCHERS.map(([m, desc]) => (
                    <MenuItem
                        key={m}
                        style={MENU_ITEM_STYLE}
                        selected={matcher === m}
                        onClick={() => {
                            handleMenuItemClick(m);
                        }}
                    >
                        {desc}
                    </MenuItem>
                ))}
            </Menu>
            <InputBase
                style={INPUT_STYLE}
                inputProps={{
                    'aria-label': 'search input',
                    onChange: handleChange,
                    onKeyDown: handleKeydown,
                    style: { padding: 0 },
                }}
                type="search"
                placeholder="Search…"
                autoFocus
            />
            <div style={COUNTER_STYLE} ref={counterElem}></div>
            <Divider style={DIVIDER_STYLE} orientation="vertical" />
            <IconButton size="small" title="Find backward" aria-label="find backward" onClick={handlePrev}>
                <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" title="Find forward" aria-label="find forward" onClick={handleNext}>
                <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" title="Close search" aria-label="close search" onClick={handleClose}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Paper>
    );
};
