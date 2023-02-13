import React, { useEffect, useState } from 'react';
import { Card, Divider, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import Row from '~/components/Common/Row';
import WhitelistBadge from '~/components/Market/Wells/WhitelistBadge';
import TokenIcon from '~/components/Common/TokenIcon';
import { BEAN } from '~/constants/tokens';
import { BeanstalkPalette, IconSize } from '~/components/App/muiTheme';
import { useWell } from '~/hooks/wells/useWell';

type WellProps = {
  wellId: string;
};

// Box on the right of the Well Detail page
const WellReserves: React.FC<WellProps> = ({ wellId }) => {
  const { wellReserves, loading } = useWell(wellId);

  const formatPercentage = (value: number) => value * 100;

  // Loading spinner?
  return (
    <Card sx={{ height: '100%', p: 1 }}>
      {!loading && (
        <Stack justifyContent="space-between" height="100%">
          <Stack p={1} pb={2} gap={1}>
            <Row justifyContent="space-between">
              <Typography variant="h4">Well Reserves</Typography>
              <WhitelistBadge isWhitelisted />
            </Row>
            <Stack gap={1}>
              <Row justifyContent="space-between">
                <Row gap={0.5}>
                  <TokenIcon token={BEAN[1]} />
                  <Typography>{wellReserves.token1}</Typography>
                </Row>
                <Typography>
                  {wellReserves.token1Amount.toLocaleString('en-us')} (
                  {`${formatPercentage(wellReserves.token1Percentage)}%`})
                </Typography>
              </Row>
              <Row justifyContent="space-between">
                <Row gap={0.5}>
                  <TokenIcon token={BEAN[1]} />
                  <Typography>{wellReserves.token2}</Typography>
                </Row>
                <Typography>
                  {wellReserves.token2Amount.toLocaleString('en-us')} (
                  {`${formatPercentage(wellReserves.token2Percentage)}%`})
                </Typography>
              </Row>
              <Divider />
              <Row justifyContent="space-between">
                <Typography>USD Total</Typography>
                <Typography>{wellReserves.usdTotal}</Typography>
              </Row>
            </Stack>
          </Stack>
          {/* TODO: if whitelisted, link to specific pool in the silo */}
          <Stack gap={1}>
            <Stack p={1} gap={1}>
              <Row justifyContent="space-between">
                <Typography>Current Bean Price</Typography>
                <Typography>0.00012 ETH (~$1.01)</Typography>
              </Row>
              <Row justifyContent="space-between">
                <Typography>Current deltaB</Typography>
                <Typography>+10,000</Typography>
              </Row>
            </Stack>
            <Row
              p={1}
              gap={1}
              sx={{
                borderRadius: 1,
                backgroundColor: BeanstalkPalette.lightestBlue,
              }}
            >
              <InfoIcon
                sx={{ width: IconSize.small, color: BeanstalkPalette.blue }}
              />
              <Typography>
                Earn up to ~5.67% vAPY for adding liquidity to this Well and
                depositing the whitelisted liquidity token in the silo here.
              </Typography>
            </Row>
            {/* <Button fullWidth component={Link} to="/silo"> */}
            {/*  <Typography variant="h4">Deposit Liquidity through the Silo</Typography> */}
            {/* </Button> */}
          </Stack>
        </Stack>
      )}
    </Card>
  );
};
export default WellReserves;
