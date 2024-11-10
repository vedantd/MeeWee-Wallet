import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { SendCryptoAssetSelectors } from '@tests/selectors/send.selectors';
import axios from 'axios';
import { Form, Formik, FormikHelpers } from 'formik';
import { Box, Flex } from 'leather-styles/jsx';
import { ObjectSchema } from 'yup';

import { HIGH_FEE_WARNING_LEARN_MORE_URL_STX } from '@leather.io/constants';
import type { Fees, Money } from '@leather.io/models';
import { Button, Link } from '@leather.io/ui';
import { formatMoney } from '@leather.io/utils';

import { StacksSendFormValues } from '@shared/models/form.model';
import { RouteUrls } from '@shared/route-urls';

import { FeesRow } from '@app/components/fees-row/fees-row';
import { AvailableBalance, ButtonRow, Card, Page } from '@app/components/layout';
import { NonceSetter } from '@app/components/nonce-setter';
import { useUpdatePersistedSendFormValues } from '@app/features/popup-send-form-restoration/use-update-persisted-send-form-values';
import { HighFeeSheet } from '@app/features/stacks-high-fee-warning/stacks-high-fee-dialog';
import { useIsPrivateMode } from '@app/store/settings/settings.selectors';

import { MemoField } from '../../components/memo-field';
import { StacksRecipientField } from '../../family/stacks/components/stacks-recipient-field';
import { defaultSendFormFormikProps } from '../../send-form.utils';

// Create a styled text component using Box
const StyledText = Box as React.FC<{
  children: React.ReactNode;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  mb?: string;
  mt?: string;
}>;

// Safety checker types
interface Analysis {
  stxBalance: number;
  totalTransactions: number;
  firstTxDate: string;
  recentTxDate: string;
  uniqueInteractions: number;
  nftCount: number;
  nftTransactions: number;
  contractInteractions: number;
  totalSent: number;
  totalReceived: number;
  hasNFTActivity: boolean;
}

interface SafetyCheckResult {
  analysis: Analysis;
  riskFactors: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  warningMessages: string[];
}

interface StacksCommonSendFormProps {
  onSubmit(
    values: StacksSendFormValues,
    formikHelpers: FormikHelpers<StacksSendFormValues>
  ): Promise<void>;
  initialValues: StacksSendFormValues;
  validationSchema: ObjectSchema<any>;
  amountField: React.JSX.Element;
  selectedAssetField: React.JSX.Element;
  availableTokenBalance: Money;
  fees?: Fees;
}

const STACKS_API = 'https://stacks-node-api.mainnet.stacks.co';

const isValidStacksAddress = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  if (!address.startsWith('SP') && !address.startsWith('SM')) return false;
  if (address.length < 39 || address.length > 41) return false;
  const validChars = /^[0-9A-Za-z]+$/;
  const addressWithoutPrefix = address.slice(2);
  return validChars.test(addressWithoutPrefix);
};

const SafetyCheckerResult = ({ result }: { result: SafetyCheckResult | null }) => {
  if (!result) return null;

  // Color config with stronger values
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'High':
        return {
          bg: 'rgba(239, 68, 68, 0.15) !important',
          color: '#DC2626 !important',
          border: '#EF4444 !important',
          customStyle: {
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#DC2626',
            borderColor: '#EF4444',
          },
        };
      case 'Low':
        return {
          bg: 'rgba(34, 197, 94, 0.15) !important',
          color: '#16A34A !important',
          border: '#22C55E !important',
          customStyle: {
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            color: '#16A34A',
            borderColor: '#22C55E',
          },
        };
      default: // Medium or default
        return {
          bg: 'rgba(234, 179, 8, 0.15) !important',
          color: '#B45309 !important',
          border: '#F59E0B !important',
          customStyle: {
            backgroundColor: 'rgba(234, 179, 8, 0.15)',
            color: '#B45309',
            borderColor: '#F59E0B',
          },
        };
    }
  };

  const colors = getRiskColor(result.riskLevel);

  return (
    <Box mt="space.04" width="100%" p="space.04" borderRadius="lg" style={colors.customStyle}>
      {/* Risk Level Header */}
      <Flex alignItems="center" mb="space.04" style={{ color: colors.customStyle.color }}>
        <Box fontSize="lg" fontWeight="bold" style={{ color: colors.customStyle.color }}>
          Risk Level: {result.riskLevel}
          <Box as="span" ml="space.02" fontSize="xl">
            {result.riskLevel === 'High' ? '⚠️' : result.riskLevel === 'Low' ? '✅' : '⚠️'}
          </Box>
        </Box>
        <Box
          ml="auto"
          px="space.03"
          py="space.01"
          borderRadius="full"
          border="1px solid"
          fontSize="sm"
          style={{
            borderColor: colors.customStyle.color,
            color: colors.customStyle.color,
          }}
        >
          {result.analysis.totalTransactions} transactions
        </Box>
      </Flex>

      {/* Analysis Summary */}
      <Flex direction="column" gap="space.04" style={{ color: colors.customStyle.color }}>
        <Flex justifyContent="space-between">
          <Box flex="1">
            <Box fontSize="sm" opacity="0.8">
              Account Age
            </Box>
            <Box fontWeight="medium">
              {result.analysis.firstTxDate
                ? new Date(result.analysis.firstTxDate).toLocaleDateString()
                : 'New Account'}
            </Box>
          </Box>
          <Box flex="1">
            <Box fontSize="sm" opacity="0.8">
              Interactions
            </Box>
            <Box fontWeight="medium">{result.analysis.uniqueInteractions}</Box>
          </Box>
        </Flex>

        <Flex justifyContent="space-between">
          <Box flex="1">
            <Box fontSize="sm" opacity="0.8">
              Contract Calls
            </Box>
            <Box fontWeight="medium">{result.analysis.contractInteractions}</Box>
          </Box>
          <Box flex="1">
            <Box fontSize="sm" opacity="0.8">
              NFT Activity
            </Box>
            <Box fontWeight="medium">{result.analysis.hasNFTActivity ? 'Yes' : 'No'}</Box>
          </Box>
        </Flex>
      </Flex>

      {/* Risk Factors */}
      {result.riskFactors.length > 0 && (
        <Box
          mt="space.04"
          p="space.03"
          borderRadius="md"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            color: colors.customStyle.color,
          }}
        >
          <Box fontSize="sm" fontWeight="medium" mb="space.02">
            Risk Factors:
          </Box>
          {result.riskFactors.map((factor, index) => (
            <Flex
              key={index}
              alignItems="center"
              fontSize="sm"
              mb={index < result.riskFactors.length - 1 ? 'space.02' : '0'}
            >
              <Box mr="space.02">•</Box>
              {factor}
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
};

const fetchWithRetry = async (url: string, params = {}, retries = 2) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { params });
      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          data: {
            results: [],
            stx: { balance: '0', total_sent: '0', total_received: '0' },
            fungible_tokens: {},
            non_fungible_tokens: {},
          },
        };
      }
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries reached');
};

export function StacksCommonSendForm({
  onSubmit,
  initialValues,
  validationSchema,
  amountField,
  selectedAssetField,
  fees,
  availableTokenBalance,
}: StacksCommonSendFormProps) {
  const navigate = useNavigate();
  const { onFormStateChange } = useUpdatePersistedSendFormValues();
  const isPrivate = useIsPrivateMode();
  const [safetyResult, setSafetyResult] = useState<SafetyCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const checkAddressSafety = async (address: string) => {
    if (!isValidStacksAddress(address)) {
      setSafetyResult(null);
      return;
    }

    setChecking(true);
    try {
      const [balanceResponse, txsResponse, transfersResponse] = await Promise.all([
        fetchWithRetry(`${STACKS_API}/extended/v1/address/${address}/balances`),
        fetchWithRetry(`${STACKS_API}/extended/v1/address/${address}/transactions`, {
          limit: 50,
          offset: 0,
        }),
        fetchWithRetry(`${STACKS_API}/extended/v1/address/${address}/transfers`, {
          limit: 50,
          offset: 0,
        }),
      ]);

      const transactions = txsResponse.data.results || [];
      const transfers = transfersResponse.data.results || [];
      const balance = balanceResponse.data;

      const totalSent = parseInt(balance.stx.total_sent || '0') / 1000000;
      const totalReceived = parseInt(balance.stx.total_received || '0') / 1000000;

      const analysis: Analysis = {
        stxBalance: parseInt(balance.stx.balance) / 1000000,
        totalTransactions: transactions.length,
        firstTxDate: transactions[transactions.length - 1]?.burn_block_time_iso || '',
        recentTxDate: transactions[0]?.burn_block_time_iso || '',
        uniqueInteractions: new Set([
          ...transfers.map((tx: any) => tx.sender_address),
          ...transfers.map((tx: any) => tx.recipient_address),
        ]).size,
        nftCount: Object.keys(balance.non_fungible_tokens || {}).length,
        nftTransactions: transfers.filter((tx: any) => tx.amount === '1').length,
        contractInteractions: transactions.filter((tx: any) => tx.tx_type === 'contract_call')
          .length,
        totalSent,
        totalReceived,
        hasNFTActivity: false,
      };

      const riskFactors: string[] = [];
      const warningMessages: string[] = [];

      if (!analysis.firstTxDate) {
        riskFactors.push('No transaction history found');
      } else {
        const addressAge =
          (new Date().getTime() - new Date(analysis.firstTxDate).getTime()) / (1000 * 60 * 60 * 24);
        if (addressAge < 30) {
          riskFactors.push('Address is less than 30 days old');
        }
      }

      if (analysis.totalTransactions < 5) {
        riskFactors.push('Very few transactions');
      }

      if (analysis.uniqueInteractions < 3) {
        riskFactors.push('Limited interaction with other addresses');
      }

      const recentTransfers = transfers.slice(0, 10);
      const hasLargeOutflows = recentTransfers.some((transfer: any) => {
        const amount = parseInt(transfer.amount) / 1000000;
        return transfer.sender_address === address && amount > 10000;
      });

      if (hasLargeOutflows) {
        riskFactors.push('Contains recent large outgoing transfers');
      }

      if (totalSent > 0 && totalReceived / totalSent < 0.1) {
        warningMessages.push('High ratio of outgoing to incoming transactions');
      }

      const failedTxCount = transactions.filter((tx: any) => tx.tx_status === 'failed').length;
      if (failedTxCount > 5) {
        warningMessages.push('High number of failed transactions');
      }

      const riskLevel =
        riskFactors.length === 0 ? 'Low' : riskFactors.length <= 2 ? 'Medium' : 'High';

      setSafetyResult({
        analysis: {
          ...analysis,
          hasNFTActivity: analysis.nftCount > 0 || analysis.nftTransactions > 0,
        },
        riskFactors,
        riskLevel,
        warningMessages,
      });
    } catch (error) {
      setSafetyResult(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Page>
      <Formik
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
        {...defaultSendFormFormikProps}
      >
        {props => {
          onFormStateChange(props.values);

          useEffect(() => {
            const recipientAddress = props.values.recipient;
            if (recipientAddress && recipientAddress.length > 38) {
              checkAddressSafety(recipientAddress);
            }
          }, [props.values.recipient]);

          return (
            <>
              <NonceSetter />
              <Form>
                <Card
                  dataTestId={SendCryptoAssetSelectors.SendForm}
                  footer={
                    <ButtonRow>
                      <Button
                        aria-busy={props.isValidating || checking}
                        data-testid={SendCryptoAssetSelectors.PreviewSendTxBtn}
                        onClick={() => props.handleSubmit()}
                        type="submit"
                        fullWidth
                        disabled={checking || safetyResult?.riskLevel === 'High'}
                      >
                        {checking
                          ? 'Checking Address Safety...'
                          : safetyResult?.riskLevel === 'High'
                            ? 'High Risk - Sending Not Recommended'
                            : 'Continue'}
                      </Button>
                      <AvailableBalance
                        balance={formatMoney(availableTokenBalance)}
                        isPrivate={isPrivate}
                      />
                    </ButtonRow>
                  }
                >
                  <Flex
                    width="100%"
                    flexDirection="column"
                    marginBottom={{ base: 'unset', sm: '33px' }}
                  >
                    {amountField}
                    {selectedAssetField}
                    <StacksRecipientField />
                    <Box mt="space.04" width="100%">
                      <SafetyCheckerResult result={safetyResult} />
                    </Box>
                    <MemoField />
                    <Box mt="space.04" width="100%">
                      <FeesRow fees={fees} isSponsored={false} />
                    </Box>
                    <Link
                      alignSelf="flex-end"
                      mt="space.04"
                      onClick={() => navigate(RouteUrls.EditNonce)}
                    >
                      Edit nonce
                    </Link>
                  </Flex>
                </Card>
                <HighFeeSheet learnMoreUrl={HIGH_FEE_WARNING_LEARN_MORE_URL_STX} />
                <Outlet />
              </Form>
            </>
          );
        }}
      </Formik>
    </Page>
  );
}
